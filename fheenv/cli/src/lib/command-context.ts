import { Chain, createPublicClient as createViemPublicClient, http, PublicClient } from "viem";
import { FheEnvConfigV2 } from "./config-v2";
import { CredentialStore } from "./credential-types";
import {
  NativeCredentialStore,
  parseCredentialReference,
  resolveCredential,
} from "./credential-store";
import { SensitiveValueRegistry, sanitizeError } from "./redaction";
import { assertSignerCapabilities, SignerProvider, SignerSession } from "./signer-types";
import { LocalEncryptedSignerProvider } from "./signers/local-encrypted";
import { LedgerSignerProvider } from "./signers/ledger";
import { WalletConnectSignerProvider } from "./signers/walletconnect";
import { AwsKmsSignerProvider } from "./signers/aws-kms";
import { ExternalSignerProvider } from "./signers/external";
import { toFunctionSelector } from "viem";
import {
  EncryptedWalletConnectStorage,
  loadInstallationId,
  WalletConnectStateStore,
} from "./walletconnect-state";
import { ExecutableSecretProvider } from "./external-secret-provider";

export interface CommandContext {
  config: FheEnvConfigV2;
  rpcUrl: string;
  chain: Chain;
  publicClient: PublicClient;
  signer: SignerSession;
  credentials: {
    storage(): Promise<string>;
  };
  sanitize(error: unknown): string;
  close(): Promise<void>;
}

export async function withCommandContext<T>(
  create: () => Promise<CommandContext>,
  operation: (context: CommandContext) => Promise<T>,
): Promise<T> {
  const context = await create();
  let result: T | undefined;
  let failure: Error | undefined;
  try {
    result = await operation(context);
  } catch (error) {
    const message =
      typeof context.sanitize === "function"
        ? context.sanitize(error)
        : sanitizeError(error, new SensitiveValueRegistry());
    failure = new Error(message);
  }
  try {
    await context.close();
  } catch (error) {
    if (!failure) {
      const message =
        typeof context.sanitize === "function"
          ? context.sanitize(error)
          : sanitizeError(error, new SensitiveValueRegistry());
      failure = new Error(message);
    }
  }
  if (failure) throw failure;
  return result as T;
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
  const keyring = dependencies.keyring ?? new NativeCredentialStore();
  const externalSecretProvider =
    dependencies.externalSecretProvider ??
    new ExecutableSecretProvider(dependencies.environment ?? process.env);
  let signer: SignerSession | undefined;
  try {
    const rpcUrl =
      "url" in config.rpc
        ? config.rpc.url
        : await resolveCredential(parseCredentialReference(config.rpc.credentialRef), {
            mode: config.securityMode,
            keyring,
            environment: dependencies.environment ?? process.env,
            externalSecretProvider,
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
    let provider = dependencies.signerProviders?.[config.signer.type];
    if (!provider && config.signer.type === "local-encrypted") {
      provider = new LocalEncryptedSignerProvider({
        securityMode: config.securityMode,
        environment: dependencies.environment,
      });
    } else if (!provider && config.signer.type === "ledger") {
      provider = new LedgerSignerProvider({
        derivationPath: config.signer.derivationPath,
      });
    } else if (!provider && config.signer.type === "walletconnect") {
      const projectId = await resolveCredential(
        parseCredentialReference(config.signer.credentialRef),
        {
          mode: config.securityMode,
          keyring,
          environment: dependencies.environment ?? process.env,
          externalSecretProvider,
          registry,
        },
      );
      provider = new WalletConnectSignerProvider({
        projectId,
        storage: new EncryptedWalletConnectStorage(
          new WalletConnectStateStore({
            credentials: keyring,
            installationId: loadInstallationId(),
          }),
        ),
      });
    } else if (!provider && config.signer.type === "aws-kms") {
      provider = new AwsKmsSignerProvider({
        keyId: config.signer.keyId,
        policy: {
          chainIds: [config.chainId],
          contracts: {
            [config.registryAddress]: [
              "createProject(string)",
              "updateEnvironment(uint256,string,(uint256,uint8,uint8,bytes),(uint256,uint8,uint8,bytes),string,uint256)",
              "grantAccess(uint256,string,address)",
              "revokeAccess(uint256,string,address)",
              "batchGrantAccess(uint256,string,address[])",
              "removeOwner(uint256,address)",
            ].map(toFunctionSelector),
          },
          maxValueWei: "0",
          maxGas: "5000000",
          maxFeePerGasWei: "500000000000",
        },
      });
    } else if (!provider && config.signer.type === "external") {
      const variable = `FHEENV_EXTERNAL_SIGNER_${config.signer.provider
        .replace(/-/g, "_")
        .toUpperCase()}`;
      const executable = (dependencies.environment ?? process.env)[variable];
      if (!executable) {
        throw new Error(`External signer provider ${config.signer.provider} is not configured.`);
      }
      provider = new ExternalSignerProvider({
        executable,
        expectedAddress: config.signer.expectedAddress as `0x${string}`,
        securityMode: config.securityMode,
        environment: dependencies.environment,
        registry,
      });
    }
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
            keyring,
            environment: dependencies.environment ?? process.env,
            externalSecretProvider,
            registry,
          }),
      },
      sanitize: (error) => sanitizeError(error, registry),
      close: () => signer!.close(),
    };
  } catch (error) {
    let cleanupError: unknown;
    try {
      await signer?.close();
    } catch (closeError) {
      cleanupError = closeError;
    }
    const message = sanitizeError(error, registry);
    const cleanupMessage =
      cleanupError === undefined ? "" : ` Cleanup failed: ${sanitizeError(cleanupError, registry)}`;
    // The original errors can contain credentials; retaining them as causes defeats redaction.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`${message}${cleanupMessage}`);
  }
}
