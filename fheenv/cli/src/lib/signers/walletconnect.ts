import { EthereumProvider } from "@walletconnect/ethereum-provider";
import qrcode from "qrcode-terminal";
import {
  Address,
  Chain,
  createPublicClient,
  createWalletClient,
  custom,
  hashMessage,
  hashTypedData,
  Hex,
  http,
  recoverAddress,
  WalletClient,
} from "viem";
import { createSignerSession, SignerProvider, SignerSession } from "../signer-types";
import { WalletConnectKeyValueStorage } from "../walletconnect-state";

interface Eip1193Provider {
  accounts: string[];
  chainId: number;
  on(event: string, listener: (...args: unknown[]) => void): void;
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown>;
  abortPairingAttempt?(): void;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

interface WalletConnectDependencies {
  projectId: string;
  createProvider?: () => Promise<Eip1193Provider>;
  renderQr?: (uri: string) => void;
  writeOutput?: (message: string) => void;
  timeoutMs?: number;
  storage?: WalletConnectKeyValueStorage;
  simulateTransaction?: (input: {
    request: Record<string, unknown>;
    address: Address;
    chain: Chain;
  }) => Promise<void>;
  verifyTransaction?: (input: {
    hash: Hex;
    request: Record<string, unknown>;
    address: Address;
    chain: Chain;
  }) => Promise<void>;
}

export class WalletConnectError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`${code}: ${message}`);
    if (options?.cause !== undefined) Object.assign(this, { cause: options.cause });
  }
}

export function assertWalletConnectTransactionMatches(
  transaction: {
    chainId?: number;
    from: Address;
    to?: Address | null;
    value: bigint;
    input: Hex;
    gas: bigint;
  },
  request: Record<string, unknown>,
  expectedSender: Address,
  expectedChainId: number,
): void {
  const requestedTo = String(request.to ?? "").toLowerCase();
  const requestedValue = BigInt(String(request.value ?? "0x0"));
  const requestedData = String(request.data ?? "0x").toLowerCase();
  const mismatch =
    transaction.chainId !== expectedChainId ||
    transaction.from.toLowerCase() !== expectedSender.toLowerCase() ||
    transaction.to?.toLowerCase() !== requestedTo ||
    transaction.value !== requestedValue ||
    transaction.input.toLowerCase() !== requestedData ||
    (request.gas !== undefined && transaction.gas !== BigInt(String(request.gas)));
  if (mismatch) {
    throw new WalletConnectError(
      "WALLETCONNECT_TRANSACTION_MISMATCH",
      "Submitted transaction does not match the approved request.",
    );
  }
}

export function assertWalletConnectReceiptSucceeded(receipt: { status: string }): void {
  if (receipt.status !== "success") {
    throw new WalletConnectError(
      "WALLETCONNECT_TRANSACTION_REVERTED",
      "Submitted transaction reverted.",
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new WalletConnectError("WALLETCONNECT_TIMEOUT", "Wallet connection timed out.")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class WalletConnectSignerProvider implements SignerProvider {
  private readonly createProvider?: () => Promise<Eip1193Provider>;
  private readonly renderQr: (uri: string) => void;
  private readonly writeOutput: (message: string) => void;
  private readonly timeoutMs: number;

  constructor(private readonly dependencies: WalletConnectDependencies) {
    this.createProvider = dependencies.createProvider;
    this.renderQr = dependencies.renderQr ?? ((uri) => qrcode.generate(uri, { small: true }));
    this.writeOutput = dependencies.writeOutput ?? console.log;
    this.timeoutMs = dependencies.timeoutMs ?? 120_000;
  }

  async connect(input: {
    chain: Chain;
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession> {
    let provider: Eip1193Provider | undefined;
    try {
      provider = await this.createProviderForChain(input.chain.id);
      let fatalError: WalletConnectError | undefined;
      let rejectSession: (error: WalletConnectError) => void = () => undefined;
      const sessionFailure = new Promise<never>((_resolve, reject) => {
        rejectSession = reject;
      });
      void sessionFailure.catch(() => undefined);
      const failSession = (error: WalletConnectError) => {
        fatalError = error;
        rejectSession(error);
      };
      provider.on("display_uri", (uri) => {
        if (typeof uri === "string") this.renderQr(uri);
      });
      provider.on("accountsChanged", (accounts) => {
        if (
          input.expectedAddress &&
          Array.isArray(accounts) &&
          typeof accounts[0] === "string" &&
          accounts[0].toLowerCase() !== input.expectedAddress.toLowerCase()
        ) {
          failSession(
            new WalletConnectError(
              "WALLETCONNECT_ACCOUNT_CHANGED",
              "WalletConnect account changed.",
            ),
          );
        }
      });
      provider.on("chainChanged", (chainId) => {
        const parsed = typeof chainId === "string" ? Number.parseInt(chainId, 16) : chainId;
        if (parsed !== input.chain.id) {
          failSession(
            new WalletConnectError("WALLETCONNECT_CHAIN_CHANGED", "WalletConnect chain changed."),
          );
        }
      });
      provider.on("disconnect", () => {
        failSession(
          new WalletConnectError("WALLETCONNECT_DISCONNECTED", "WalletConnect disconnected."),
        );
      });

      await withTimeout(provider.connect(), this.timeoutMs);
      const address = provider.accounts[0] as Address | undefined;
      if (!address) {
        throw new WalletConnectError(
          "WALLETCONNECT_NO_ACCOUNT",
          "WalletConnect returned no account.",
        );
      }
      if (provider.chainId !== input.chain.id) {
        throw new WalletConnectError(
          "WALLETCONNECT_WRONG_CHAIN",
          `Wallet is on the wrong chain; expected ${input.chain.id}.`,
        );
      }
      if (input.expectedAddress && address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
        throw new WalletConnectError(
          "WALLETCONNECT_WRONG_ACCOUNT",
          "WalletConnect account does not match the configured address.",
        );
      }
      const verifyTransaction =
        this.dependencies.verifyTransaction ??
        (async ({
          hash,
          request,
          address: expectedSender,
          chain,
        }: {
          hash: Hex;
          request: Record<string, unknown>;
          address: Address;
          chain: Chain;
        }) => {
          const client = createPublicClient({ chain, transport: http(input.rpcUrl) });
          const receipt = await client.waitForTransactionReceipt({
            hash,
            confirmations: 1,
            timeout: 120_000,
          });
          assertWalletConnectReceiptSucceeded(receipt);
          const transaction = await client.getTransaction({ hash });
          assertWalletConnectTransactionMatches(transaction, request, expectedSender, chain.id);
        });
      const simulateTransaction =
        this.dependencies.simulateTransaction ??
        (async ({
          request,
          address: expectedSender,
          chain,
        }: {
          request: Record<string, unknown>;
          address: Address;
          chain: Chain;
        }) => {
          const client = createPublicClient({ chain, transport: http(input.rpcUrl) });
          await client.call({
            account: expectedSender,
            to: request.to as Address | undefined,
            data: request.data as Hex | undefined,
            value: request.value === undefined ? undefined : BigInt(String(request.value)),
            gas: request.gas === undefined ? undefined : BigInt(String(request.gas)),
          });
        });

      const guardedProvider = {
        request: async (request: { method: string; params?: unknown }) => {
          if (fatalError) throw fatalError;
          if (
            provider!.chainId !== input.chain.id ||
            provider!.accounts[0]?.toLowerCase() !== address.toLowerCase()
          ) {
            throw new WalletConnectError(
              "WALLETCONNECT_SESSION_CHANGED",
              "WalletConnect session changed before signing.",
            );
          }
          try {
            const transactionRequest =
              request.method === "eth_sendTransaction" && Array.isArray(request.params)
                ? (request.params[0] as Record<string, unknown> | undefined)
                : undefined;
            if (request.method === "eth_sendTransaction") {
              if (!transactionRequest) {
                throw new WalletConnectError(
                  "WALLETCONNECT_INVALID_REQUEST",
                  "Transaction request is missing.",
                );
              }
              await simulateTransaction({
                request: transactionRequest,
                address,
                chain: input.chain,
              });
            }
            const response = await Promise.race([provider!.request(request), sessionFailure]);
            if (
              request.method === "eth_sendTransaction" &&
              (typeof response !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(response))
            ) {
              throw new WalletConnectError(
                "WALLETCONNECT_INVALID_RESPONSE",
                "Wallet returned an invalid transaction hash.",
              );
            }
            if (request.method === "eth_sendTransaction") {
              await verifyTransaction({
                hash: response as Hex,
                request: transactionRequest!,
                address,
                chain: input.chain,
              });
            }
            if (request.method === "personal_sign" || request.method === "eth_signTypedData_v4") {
              if (typeof response !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(response)) {
                throw new WalletConnectError(
                  "WALLETCONNECT_INVALID_RESPONSE",
                  "Wallet returned an invalid signature.",
                );
              }
              const params = Array.isArray(request.params) ? request.params : [];
              const hash =
                request.method === "personal_sign"
                  ? hashMessage({ raw: params[0] as Hex })
                  : hashTypedData(JSON.parse(String(params[1])));
              const recovered = await recoverAddress({ hash, signature: response as Hex });
              if (recovered.toLowerCase() !== address.toLowerCase()) {
                throw new WalletConnectError(
                  "WALLETCONNECT_SIGNATURE_MISMATCH",
                  "Wallet signature does not match the configured address.",
                );
              }
            }
            return response;
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === 4001
            ) {
              throw new WalletConnectError("WALLET_REJECTED", "Wallet rejected the request.", {
                cause: error,
              });
            }
            throw error;
          }
        },
      };
      const walletClient = createWalletClient({
        account: address,
        chain: input.chain,
        transport: custom(guardedProvider),
      }) as WalletClient;
      this.writeOutput(`Wallet connected: ${address}`);
      return createSignerSession({
        type: "walletconnect",
        address,
        walletClient,
        capabilities: {
          transactions: true,
          messages: true,
          typedData: true,
        },
        close: async () => {
          await provider!.disconnect();
        },
      });
    } catch (error) {
      if (error instanceof WalletConnectError && error.code === "WALLETCONNECT_TIMEOUT") {
        provider?.abortPairingAttempt?.();
        await this.dependencies.storage?.clear?.().catch(() => undefined);
      }
      await provider?.disconnect().catch(() => undefined);
      throw error;
    }
  }

  private async createProviderForChain(chainId: number): Promise<Eip1193Provider> {
    if (this.createProvider) return this.createProvider();
    const provider = (await EthereumProvider.init({
      projectId: this.dependencies.projectId,
      chains: [chainId],
      methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"],
      events: ["accountsChanged", "chainChanged"],
      showQrModal: false,
      storage: this.dependencies.storage,
    })) as unknown as Eip1193Provider & {
      signer?: { abortPairingAttempt?(): void };
    };
    provider.abortPairingAttempt = () => provider.signer?.abortPairingAttempt?.();
    return provider;
  }
}
