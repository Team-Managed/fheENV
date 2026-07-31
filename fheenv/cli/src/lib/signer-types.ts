import { Address, Chain, WalletClient } from "viem";

export interface SignerCapabilities {
  transactions: boolean;
  messages: boolean;
  typedData: boolean;
}

export type SignerCapability = keyof SignerCapabilities;

export interface SignerSession {
  type: string;
  address: Address;
  walletClient: WalletClient;
  capabilities: SignerCapabilities;
  close(): Promise<void>;
}

export interface SignerProvider {
  connect(input: {
    chain: Chain;
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession>;
}

export function assertSignerCapabilities(
  capabilities: SignerCapabilities,
  required: readonly SignerCapability[],
): void {
  const missing = required.filter((capability) => !capabilities[capability]);
  if (missing.length > 0) {
    throw new Error(`Signer does not support required capabilities: ${missing.join(", ")}.`);
  }
}

export function createSignerSession(session: SignerSession): SignerSession {
  let closePromise: Promise<void> | undefined;
  return {
    ...session,
    close() {
      closePromise ??= Promise.resolve().then(() => session.close());
      return closePromise;
    },
  };
}
