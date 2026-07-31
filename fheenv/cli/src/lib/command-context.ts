import { Chain, createPublicClient as createViemPublicClient, http, PublicClient } from "viem";
import { FheEnvConfigV2 } from "./config-v2";
import { CredentialStore } from "./credential-types";
import {
  NativeCredentialStore,
  parseCredentialReference,
  resolveCredential,
} from "./credential-store";
import { errorWithCause } from "./errors";
import { SensitiveValueRegistry, sanitizeError } from "./redaction";
import { assertSignerCapabilities, SignerProvider, SignerSession } from "./signer-types";
import { LocalEncryptedSignerProvider } from "./signers/local-encrypted";

export interface CommandContext {
  config: FheEnvConfigV2;
  rpcUrl: string;
  chain: Chain;
  publicClient: PublicClient;
  signer: SignerSession;
  credentials: {
    storage(): Promise<string>;
  };
  close(): Promise<void>;
}

export async function withCommandContext<T>(
  create: () => Promise<CommandContext>,
  operation: (context: CommandContext) => Promise<T>,
): Promise<T> {
  const context = await create();
  try {
    return await operation(context);
  } finally {
    await context.close();
  }
}

interface CommandContextDependencies {
  keyring?: CredentialStore;
  environment?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  externalSecretProvider?: {
    resolve(provider: string, key: string): Promise<string | null>;
  };
  registry?: SensitiveValueRegistry;
  signerProviders?: Partial<Record<FheEnvConfigV2["signer"]["type"], SignerProvider>>;
  createPublicClient?: (input: { chain: Chain; rpcUrl: string }) => PublicClient;
}

function chainFor(config: FheEnvConfigV2, rpcUrl: string): Chain {
  return {
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

function assertHttpsRpcUrl(rpcUrl: string): void {
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error("Resolved RPC URL is invalid.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Resolved RPC URL must use HTTPS.");
  }
}

export async function createCommandContext(
  config: FheEnvConfigV2,
  dependencies: CommandContextDependencies = {},
): Promise<CommandContext> {
  const registry = dependencies.registry ?? new SensitiveValueRegistry();
  let signer: SignerSession | undefined;
  try {
    const rpcUrl =
      "url" in config.rpc
        ? config.rpc.url
        : await resolveCredential(parseCredentialReference(config.rpc.credentialRef), {
            mode: config.securityMode,
            keyring: dependencies.keyring ?? new NativeCredentialStore(),
            environment: dependencies.environment ?? process.env,
            externalSecretProvider: dependencies.externalSecretProvider,
            registry,
          });
    assertHttpsRpcUrl(rpcUrl);
    const chain = chainFor(config, rpcUrl);
    const publicClientFactory =
      dependencies.createPublicClient ??
      ((input: { chain: Chain; rpcUrl: string }) =>
        createViemPublicClient({
          chain: input.chain,
          transport: http(input.rpcUrl),
        }) as PublicClient);
    const defaultProvider =
      config.signer.type === "local-encrypted"
        ? new LocalEncryptedSignerProvider({
            securityMode: config.securityMode,
            environment: dependencies.environment,
          })
        : undefined;
    const provider = dependencies.signerProviders?.[config.signer.type] ?? defaultProvider;
    if (!provider) {
      throw new Error(`Signer provider ${config.signer.type} is not configured.`);
    }
    signer = await provider.connect({
      chain,
      rpcUrl,
      expectedAddress: config.signer.expectedAddress as `0x${string}` | undefined,
    });
    assertSignerCapabilities(signer.capabilities, ["transactions", "messages", "typedData"]);
    const publicClient = publicClientFactory({ chain, rpcUrl });
    return {
      config,
      rpcUrl,
      chain,
      publicClient,
      signer,
      credentials: {
        storage: () =>
          resolveCredential(parseCredentialReference(config.storage.credentialRef), {
            mode: config.securityMode,
            keyring: dependencies.keyring ?? new NativeCredentialStore(),
            environment: dependencies.environment ?? process.env,
            externalSecretProvider: dependencies.externalSecretProvider,
            registry,
          }),
      },
      close: () => signer!.close(),
    };
  } catch (error) {
    await signer?.close();
    const sanitizedCause = new Error(sanitizeError(error, registry));
    throw errorWithCause(sanitizedCause.message, sanitizedCause);
  }
}
