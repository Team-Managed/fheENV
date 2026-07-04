import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import {
  generateAesKeyNode,
  aesEncryptNode,
  splitAesKeyToUint128Node,
} from "../lib/aes-node";
import { uploadToIPFSNode } from "../lib/ipfs-node";
import {
  getEnvironment,
  updateEnvironment,
  batchGrantAccess,
  getActiveMembers,
} from "../lib/contracts-node";
import {
  createFheClient,
  fheEncryptUint128,
  toInEuint128,
} from "../lib/fhe-node";
import { type Address } from "viem";

export interface RotateOptions {
  envName?: string;
  envFile?: string;
}

/**
 * Rotate the AES key for an environment:
 *   1. Re-read the current plaintext env from the local .env file (or the
 *      caller can pass a file path).
 *   2. Generate a brand-new AES-256 key.
 *   3. Re-encrypt the blob and upload to IPFS.
 *   4. FHE-encrypt the new key halves and write to chain (updateEnvironment).
 *   5. Re-grant access to every address that was previously active.
 *
 * After rotation, the old ciphertext handles are abandoned on-chain. Any
 * member who only held FHE.allow on the OLD handles can no longer decrypt.
 */
export async function rotateCommand(opts: RotateOptions = {}): Promise<void> {
  const config = readConfig();
  const envName = (opts.envName ?? "production").toLowerCase();
  const envFile = opts.envFile ?? ".env";

  const spinner = ora(`Rotating AES key for env "${envName}"...`).start();
  try {
    const { publicClient, walletClient, account } = createClients(
      config.rpcUrl,
      config.chainId,
    );
    const registryAddress = config.registryAddress as Address;
    const projectId = BigInt(config.projectId);

    // 1. Read current env blob from IPFS so we can re-encrypt its content
    spinner.text = "Fetching current environment from chain...";
    const currentEnv = await getEnvironment(
      registryAddress,
      projectId,
      envName,
      publicClient,
    );
    if (!currentEnv.blobCid) {
      throw new Error(
        `Environment "${envName}" has not been pushed yet. Run \`fheenv push\` first.`,
      );
    }

    // 2. Get current active members (will be re-granted after rotation)
    spinner.text = "Reading current member list from chain events...";
    const activeMembers = await getActiveMembers(
      registryAddress,
      projectId,
      envName,
      publicClient,
    );

    // 3. Read the local .env file for re-encryption
    const fs = await import("fs");
    const path = await import("path");
    const envFilePath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(envFilePath)) {
      throw new Error(
        `Env file not found: ${envFilePath}\n` +
          `  Tip: provide the file path with --file <path>`,
      );
    }
    const envContent = fs.readFileSync(envFilePath, "utf-8");

    // 4. Generate fresh AES key and encrypt
    spinner.text = "Generating new AES-256 key...";
    const aesKey = generateAesKeyNode();
    const encryptedBlob = aesEncryptNode(envContent, aesKey);
    const [keyHigh, keyLow] = splitAesKeyToUint128Node(aesKey);

    // 5. Upload new blob to IPFS
    spinner.text = "Uploading re-encrypted blob to IPFS...";
    const blobCid = await uploadToIPFSNode(
      encryptedBlob,
      envFile,
      config.pinataJwt,
    );

    // 6. FHE-encrypt new key halves
    spinner.text = "FHE-encrypting new AES key...";
    const fheClient = await createFheClient(
      config.chainId,
      publicClient,
      walletClient,
    );
    const encHigh = await fheEncryptUint128(
      fheClient,
      keyHigh,
      account.address,
      config.chainId,
    );
    const encLow = await fheEncryptUint128(
      fheClient,
      keyLow,
      account.address,
      config.chainId,
    );

    // 7. Write new environment to chain (issues fresh FHE handles)
    spinner.text = "Writing rotated environment to chain...";
    await updateEnvironment(
      registryAddress,
      {
        projectId,
        envName,
        inKeyHigh: toInEuint128(encHigh),
        inKeyLow: toInEuint128(encLow),
        blobCid,
        expectedVersion: currentEnv.version,
      },
      walletClient,
      publicClient,
    );

    // 8. Re-grant access to all previously active members on the NEW handles
    if (activeMembers.length > 0) {
      spinner.text = `Re-granting access to ${activeMembers.length} member(s)...`;
      await batchGrantAccess(
        registryAddress,
        projectId,
        envName,
        activeMembers,
        walletClient,
        publicClient,
      );
    }

    spinner.succeed(
      chalk.green(
        `Rotation complete for "${envName}" (v${currentEnv.version + 1n})`,
      ),
    );
    console.log(chalk.dim(`  New IPFS CID : ${blobCid}`));
    console.log(
      chalk.dim(
        `  Members re-granted : ${
          activeMembers.length > 0 ? activeMembers.join(", ") : "none"
        }`,
      ),
    );
    console.log(
      chalk.yellow(
        "\n  Old ciphertext handles are now abandoned. Removed members can no longer decrypt.",
      ),
    );
  } catch (err) {
    spinner.fail("Rotation failed");
    throw err;
  }
}
