// ABI derived from compiled fheENVRegistry artifact.
// InEuint128 tuple: (uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature)
import { type PublicClient, type WalletClient, type Address, type Hex } from "viem";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InEuint128 {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: Hex;
}

export interface EnvironmentData {
  aesKeyHigh: bigint; // ctHash of encrypted AES key high 128 bits
  aesKeyLow: bigint; // ctHash of encrypted AES key low 128 bits
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
      { internalType: "address[]", name: "newMembers", type: "address[]" },
    ],
    name: "batchGrantAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "envName", type: "string" }],
    name: "envNameToHash",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "pure",
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
    inputs: [],
    name: "nextProjectId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "string", name: "envName", type: "string" },
      { internalType: "address", name: "member", type: "address" },
      { internalType: "uint256", name: "expiresAt", type: "uint256" },
    ],
    name: "grantAccessWithExpiry",
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
    name: "expireAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "projectId", type: "uint256" },
      { internalType: "bytes32", name: "", type: "bytes32" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "memberExpiry",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    name: "AccessGranted",
    type: "event",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "envHash", type: "bytes32", indexed: true },
      { name: "member", type: "address", indexed: true },
    ],
  },
  {
    name: "AccessGrantedWithExpiry",
    type: "event",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "envHash", type: "bytes32", indexed: true },
      { name: "member", type: "address", indexed: true },
      { name: "expiresAt", type: "uint256", indexed: false },
    ],
  },
  {
    name: "AccessRevoked",
    type: "event",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "envHash", type: "bytes32", indexed: true },
      { name: "member", type: "address", indexed: true },
    ],
  },
] as const;

// ── Read helpers ───────────────────────────────────────────────────────────────

export async function getEnvironment(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  publicClient: PublicClient,
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
  publicClient: PublicClient,
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
  // keccak256("ProjectCreated(uint256,address,string)")
  const projectCreatedTopic =
    "0x9d9ec461f162f3f4fdb9f6d189bfe13c59e48d8acd23a4c3bfcf7cc0fe4e84ed" as Hex;

  for (const log of receipt.logs) {
    if (log.topics[0] === projectCreatedTopic && log.topics[1]) {
      return BigInt(log.topics[1]);
    }
  }

  // Fallback: read nextProjectId - 1
  const next = (await publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "nextProjectId",
    args: [],
  })) as bigint;
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
  publicClient: PublicClient,
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

export async function grantAccessWithExpiry(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  member: Address,
  expiresAt: bigint,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<void> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "grantAccessWithExpiry",
    args: [projectId, envName, member, expiresAt],
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
  publicClient: PublicClient,
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
  publicClient: PublicClient,
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

export async function batchGrantAccess(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  members: Address[],
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<void> {
  if (members.length === 0) return;
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient has no account");

  // Contract caps batch at 100; split if needed
  for (let i = 0; i < members.length; i += 100) {
    const chunk = members.slice(i, i + 100);
    const hash = await walletClient.writeContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "batchGrantAccess",
      args: [projectId, envName, chunk],
      account,
      chain: walletClient.chain ?? null,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

/**
 * Returns the set of addresses currently in the access list for an env
 * by replaying AccessGranted / AccessRevoked events from the chain.
 */
export async function getActiveMembers(
  registryAddress: Address,
  projectId: bigint,
  envName: string,
  publicClient: PublicClient,
): Promise<Address[]> {
  const envHash = (await publicClient.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "envNameToHash",
    args: [envName],
  })) as `0x${string}`;

  const grantedEvent = REGISTRY_ABI.find(
    (x) => x.type === "event" && x.name === "AccessGranted",
  ) as (typeof REGISTRY_ABI)[number] & { type: "event" };
  const revokedEvent = REGISTRY_ABI.find(
    (x) => x.type === "event" && x.name === "AccessRevoked",
  ) as (typeof REGISTRY_ABI)[number] & { type: "event" };

  const [grantedLogs, revokedLogs] = await Promise.all([
    publicClient.getLogs({
      address: registryAddress,
      event: grantedEvent,
      args: { projectId, envHash } as Record<string, unknown>,
      fromBlock: 0n,
    }),
    publicClient.getLogs({
      address: registryAddress,
      event: revokedEvent,
      args: { projectId, envHash } as Record<string, unknown>,
      fromBlock: 0n,
    }),
  ]);

  const granted = new Set<Address>(
    grantedLogs
      .map((l) => (l.args as Record<string, unknown>).member as Address | undefined)
      .filter(Boolean) as Address[],
  );
  const revoked = new Set<Address>(
    revokedLogs
      .map((l) => (l.args as Record<string, unknown>).member as Address | undefined)
      .filter(Boolean) as Address[],
  );

  return [...granted].filter((addr) => !revoked.has(addr));
}
