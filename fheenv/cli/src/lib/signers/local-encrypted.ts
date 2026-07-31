import { Address } from "viem";
import { SecurityMode } from "../credential-types";
import { createSignerSession, SignerProvider, SignerSession } from "../signer-types";
import { createClients, ViemClients } from "../wallet";

interface LocalEncryptedSignerDependencies {
  securityMode: SecurityMode;
  environment?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  warn?: (message: string) => void;
  createClients?: (
    rpcUrl: string,
    chainId: number,
    environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
  ) => ViemClients;
}

export class LocalEncryptedSignerProvider implements SignerProvider {
  private readonly environment: NodeJS.ProcessEnv | Record<string, string | undefined>;
  private readonly warn: (message: string) => void;
  private readonly clientFactory: NonNullable<LocalEncryptedSignerDependencies["createClients"]>;

  constructor(private readonly dependencies: LocalEncryptedSignerDependencies) {
    this.environment = dependencies.environment ?? process.env;
    this.warn = dependencies.warn ?? console.warn;
    this.clientFactory = dependencies.createClients ?? createClients;
  }

  async connect(input: {
    chain: { id: number };
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession> {
    if (this.dependencies.securityMode === "production") {
      throw new Error("The local encrypted signer is disabled in production.");
    }
    if (this.environment.FHEENV_PRIVATE_KEY) {
      this.warn("Warning: using a raw private key from FHEENV_PRIVATE_KEY in development mode.");
    }
    const clients = this.clientFactory(input.rpcUrl, input.chain.id, this.environment);
    const address = clients.account.address;
    if (input.expectedAddress && address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
      throw new Error("Local signer address does not match the configured address.");
    }
    return createSignerSession({
      type: "local-encrypted",
      address,
      walletClient: clients.walletClient,
      capabilities: { transactions: true, messages: true, typedData: true },
      close: async () => undefined,
    });
  }
}
