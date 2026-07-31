import { Address, Hex, TransactionSerializable } from "viem";

export interface SigningPolicy {
  chainIds: number[];
  contracts: Record<string, Hex[]>;
  maxValueWei: bigint;
  maxGas: bigint;
  maxFeePerGasWei: bigint;
}

export interface SerializedSigningPolicy {
  chainIds: number[];
  contracts: Record<string, string[]>;
  maxValueWei: string;
  maxGas: string;
  maxFeePerGasWei: string;
}

export function normalizeSigningPolicy(policy: SerializedSigningPolicy): SigningPolicy {
  return {
    chainIds: [...policy.chainIds],
    contracts: Object.fromEntries(
      Object.entries(policy.contracts).map(([address, selectors]) => [
        address.toLowerCase(),
        selectors.map((selector) => selector.toLowerCase() as Hex),
      ]),
    ),
    maxValueWei: BigInt(policy.maxValueWei),
    maxGas: BigInt(policy.maxGas),
    maxFeePerGasWei: BigInt(policy.maxFeePerGasWei),
  };
}

export function assertTransactionAllowed(
  transaction: TransactionSerializable & { chainId?: number; to?: Address | null },
  policy: SigningPolicy,
): void {
  if (!transaction.chainId || !policy.chainIds.includes(transaction.chainId)) {
    throw new Error("Signing policy: chain is not allowed.");
  }
  if (!transaction.to) {
    throw new Error("Signing policy: contract creation is not allowed.");
  }
  const selectors = policy.contracts[transaction.to.toLowerCase()];
  if (!selectors) {
    throw new Error("Signing policy: destination is not allowed.");
  }
  const selector = (transaction.data ?? "0x").slice(0, 10).toLowerCase();
  if (selector.length !== 10 || !selectors.includes(selector as Hex)) {
    throw new Error("Signing policy: function selector is not allowed.");
  }
  if ((transaction.value ?? 0n) > policy.maxValueWei) {
    throw new Error("Signing policy: native value exceeds the configured limit.");
  }
  if ((transaction.gas ?? 0n) > policy.maxGas) {
    throw new Error("Signing policy: gas limit exceeds the configured limit.");
  }
  const fee = transaction.maxFeePerGas ?? transaction.gasPrice ?? 0n;
  if (fee > policy.maxFeePerGasWei) {
    throw new Error("Signing policy: fee exceeds the configured limit.");
  }
}
