// ABI derived from compiled fheENVRegistry artifact.
// InEuint128 tuple: (uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature)
import {
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
} from "viem";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InEuint128 {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: Hex;
}

export interface EnvironmentData {
  aesKeyHigh: bigint; // ctHash of encrypted AES key high 128 bits
  aesKeyLow: bigint;  // ctHash of encrypted AES key low 128 bits
  blobCid: string;
  version: bigint;
  updatedAt: bigint;
}

// ── ABI ───────────────────────────────────────────────────────────────────────

const REGISTRY_ABI = [
  {
    inputs: [{ internalType: "string", name: "name", type: "string" }],
    name: "createProject",
    outputs: [{ internalType: "uint256", name: "projectId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "string", name: "envName", type: "string" },
      {
        components: [
          { internalType: "uint256", name: "ctHash", type: "uint256" },
          { internalType: "uint8", name: "securityZone", type: "uint8" },
          { internalType: "uint8", name: "utype", type: "uint8" },
          { internalType: "bytes", name: "signature", type: "bytes" },
        ],
        internalType: "struct InEuint128",
        name: "inKeyHigh",
        type: "tuple",
      },
      {
        components: [
          { internalType: "uint256", name: "ctHash", type: "uint256" },
          { internalType: "uint8", name: "securityZone", type: "uint8" },
          { internalType: "uint8", name: "utype", type: "uint8" },
          { internalType: "bytes", name: "signature", type: "bytes" },
        ],
        internalType: "struct InEuint128",
        name: "inKeyLow",
        type: "tuple",
      },
      { internalType: "string", name: "blobCid", type: "string" },
      { internalType: "uint256", name: "expectedVersion", type: "uint256" },
    ],
    name: "updateEnvironment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "string", name: "envName", type: "string" },
    ],
    name: "getEnvironment",
    outputs: [
      { internalType: "euint128", name: "aesKeyHigh", type: "bytes32" },
      { internalType: "euint128", name: "aesKeyLow", type: "bytes32" },
      { internalType: "string", name: "blobCid", type: "string" },
      { internalType: "uint256", name: "version", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "string", name: "envName", type: "string" },
      { internalType: "address", name: "member", type: "address" },
    ],
    name: "grantAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "string", name: "envName", type: "string" },
      { internalType: "address", name: "member", type: "address" },
    ],
    name: "revokeAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "string", name: "envName", type: "string" },
      { internalType: "address", name: "member", type: "address" },
    ],
    name: "hasAccess",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "nextProjectId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Read helpers ───────────────────────────────────────────────────────────────

export async function getEnvironment(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  publicClient: PublicClient
): Promise<EnvironmentData> {
  const result = (await publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "getEnvironment",
    args: [projectId, envName],
  })) as unknown as [bigint, bigint, string, bigint, bigint];

  return {
    aesKeyHigh: result[0],
    aesKeyLow: result[1],
    blobCid: result[2],
    version: result[3],
    updatedAt: result[4],
  };
}

// ── Write helpers ──────────────────────────────────────────────────────────────

export async function createProject(
  registryAddress: Address,
  name: string,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<bigint> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "createProject",
    args: [name],
    account,
    chain: walletClient.chain ?? null,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Parse ProjectCreated log to get projectId
  const projectCreatedTopic =
    "0x63c8a30d6de2a5c5a39c82e9a2a18e4b45e9a01fd4b42a0db01e2b4b8b1d1c2" as Hex;

  for (const log of receipt.logs) {
    if (log.topics[0] === projectCreatedTopic && log.topics[1]) {
      return BigInt(log.topics[1]);
    }
  }

  // Fallback: read nextProjectId - 1
  const next = await publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "nextProjectId",
    args: [0n],
  }) as bigint;
  return next - 1n;
}

export async function updateEnvironment(
  registryAddress: Address,
  params: {
    projectId: bigint;
    envName: string;
    inKeyHigh: InEuint128;
    inKeyLow: InEuint128;
    blobCid: string;
    expectedVersion: bigint;
  },
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<void> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "updateEnvironment",
    args: [
      params.projectId,
      params.envName,
      params.inKeyHigh,
      params.inKeyLow,
      params.blobCid,
      params.expectedVersion,
    ],
    account,
    chain: walletClient.chain ?? null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function grantAccess(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  member: Address,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<void> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "grantAccess",
    args: [projectId, envName, member],
    account,
    chain: walletClient.chain ?? null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function revokeAccess(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  member: Address,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<void> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "revokeAccess",
    args: [projectId, envName, member],
    account,
    chain: walletClient.chain ?? null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}
