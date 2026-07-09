import { type PublicClient, type WalletClient, type Address } from "viem";
import {
  generateAesKeyNode,
  aesEncryptNode,
  aesDecryptNode,
  splitAesKeyToUint128Node,
  joinUint128ToAesKeyNode,
} from "./aes";
import { uploadToIPFSNode, fetchFromIPFSNode } from "./ipfs";
import { getEnvironment, updateEnvironment, batchGrantAccess, getActiveMembers } from "./contracts";
import { createFheClient, fheEncryptUint128, fheDecryptUint128, toInEuint128 } from "./fhe";

export interface RotateEnvironmentParams {
  registryAddress: Address;
  projectId: bigint;
  envName: string;
  /** Plaintext .env content to re-encrypt. The caller is responsible for reading this
   *  from disk (CLI/scheduler) or another source (frontend backend). */
  envContent: string;
  pinataJwt: string;
  chainId: number;
  publicClient: PublicClient;
  walletClient: WalletClient;
  /** Members to NOT re-grant after rotation (e.g. the just-removed member). Default: [] */
  excludeMembers?: Address[];
  /** Block to start scanning events from — avoids RPC block range limits. */
  fromBlock?: bigint;
  /** Pre-supplied member list — skips eth_getLogs entirely when provided. */
  knownMembers?: Address[];
}

export interface RotateEnvironmentResult {
  /** New IPFS CID of the re-encrypted blob */
  newCid: string;
  /** Previous IPFS CID — pass to unpinFromIPFSNode after a grace window (Phase 3) */
  previousCid: string;
  /** New on-chain version number */
  newVersion: bigint;
  /** Members who were re-granted access on the new FHE handles */
  membersRegranted: Address[];
}

/**
 * Core rotation pipeline — shared by the CLI, scheduler (Phase 4), and any
 * other caller. This is the single source of truth for rotation logic.
 *
 * Steps:
 *   1. Fetch current environment from chain (version + previousCid)
 *   2. Get active members, minus any in excludeMembers
 *   3. Generate fresh AES-256-GCM key and re-encrypt envContent
 *   4. Upload new blob to IPFS
 *   5. FHE-encrypt new key halves
 *   6. Write new environment to chain (updateEnvironment)
 *   7. Re-grant access to remaining active members (batchGrantAccess)
 *
 * IPFS unpin of previousCid is intentionally NOT done here — callers handle
 * it after a short grace window (see §4.4 of the spec). The previousCid is
 * returned so callers can schedule the unpin.
 */
export async function rotateEnvironment(
  params: RotateEnvironmentParams,
): Promise<RotateEnvironmentResult> {
  const {
    registryAddress,
    projectId,
    envName,
    envContent,
    pinataJwt,
    chainId,
    publicClient,
    walletClient,
    excludeMembers = [],
  } = params;

  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  // 1. Fetch current environment (version + previousCid)
  const currentEnv = await getEnvironment(registryAddress, projectId, envName, publicClient);
  if (!currentEnv.blobCid) {
    throw new Error(`Environment "${envName}" has not been pushed yet. Run \`fheenv push\` first.`);
  }
  const previousCid = currentEnv.blobCid;

  // 2. Get active members, excluding any that should not be re-granted
  const allActiveMembers = params.knownMembers
    ? params.knownMembers
    : await getActiveMembers(registryAddress, projectId, envName, publicClient, params.fromBlock);
  const excludeSet = new Set(excludeMembers.map((a) => a.toLowerCase()));
  const membersToRegrant = allActiveMembers.filter((m) => !excludeSet.has(m.toLowerCase()));

  // 3. Generate fresh AES-256-GCM key and re-encrypt
  const aesKey = generateAesKeyNode();
  const encryptedBlob = aesEncryptNode(envContent, aesKey);
  const [keyHigh, keyLow] = splitAesKeyToUint128Node(aesKey);

  // 4. Upload new blob to IPFS
  const newCid = await uploadToIPFSNode(encryptedBlob, envName, pinataJwt);

  // 5. FHE-encrypt new key halves
  const fheClient = await createFheClient(chainId, publicClient, walletClient);
  const encHigh = await fheEncryptUint128(fheClient, keyHigh, account.address, chainId);
  const encLow = await fheEncryptUint128(fheClient, keyLow, account.address, chainId);

  // 6. Write new environment to chain (issues fresh FHE handles, abandons old ones)
  await updateEnvironment(
    registryAddress,
    {
      projectId,
      envName,
      inKeyHigh: toInEuint128(encHigh),
      inKeyLow: toInEuint128(encLow),
      blobCid: newCid,
      expectedVersion: currentEnv.version,
    },
    walletClient,
    publicClient,
  );

  // 7. Re-grant access to remaining members on the new handles
  if (membersToRegrant.length > 0) {
    await batchGrantAccess(
      registryAddress,
      projectId,
      envName,
      membersToRegrant,
      walletClient,
      publicClient,
    );
  }

  return {
    newCid,
    previousCid,
    newVersion: currentEnv.version + 1n,
    membersRegranted: membersToRegrant,
  };
}

export interface DecryptEnvironmentParams {
  registryAddress: Address;
  projectId: bigint;
  envName: string;
  chainId: number;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export interface DecryptEnvironmentResult {
  envContent: string;
  blobCid: string;
  version: bigint;
  updatedAt: bigint;
}

/**
 * Decrypt the current environment content — used by the scheduled rotation
 * worker to obtain plaintext before re-encrypting with a fresh AES key.
 *
 * The calling credential must have FHE decrypt access (i.e. must have been
 * granted via batchGrantAccess at some point).
 */
export async function decryptEnvironmentContent(
  params: DecryptEnvironmentParams,
): Promise<DecryptEnvironmentResult> {
  const { registryAddress, projectId, envName, chainId, publicClient, walletClient } = params;

  // 1. Get current handles from chain
  const envData = await getEnvironment(registryAddress, projectId, envName, publicClient);
  if (!envData.blobCid) {
    throw new Error(`Environment "${envName}" has not been pushed yet.`);
  }

  // 2. FHE-decrypt AES key halves
  const fheClient = await createFheClient(chainId, publicClient, walletClient);
  const keyHigh = await fheDecryptUint128(
    fheClient,
    envData.aesKeyHigh,
    chainId,
    publicClient,
    walletClient,
  );
  const keyLow = await fheDecryptUint128(
    fheClient,
    envData.aesKeyLow,
    chainId,
    publicClient,
    walletClient,
  );

  // 3. Reconstruct AES key, fetch blob, decrypt
  const aesKey = joinUint128ToAesKeyNode(keyHigh, keyLow);
  const encryptedBlob = await fetchFromIPFSNode(envData.blobCid);
  const envContent = aesDecryptNode(encryptedBlob, aesKey);

  return {
    envContent,
    blobCid: envData.blobCid,
    version: envData.version,
    updatedAt: envData.updatedAt,
  };
}
