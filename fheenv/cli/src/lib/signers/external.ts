import { spawn } from "child_process";
import crypto from "crypto";
import path from "path";
import {
  Address,
  createPublicClient,
  createWalletClient,
  hashMessage,
  hashTypedData,
  Hex,
  http,
  keccak256,
  parseSignature,
  recoverAddress,
  serializeTransaction,
  WalletClient,
} from "viem";
import { toAccount } from "viem/accounts";
import { createSignerSession, SignerProvider, SignerSession } from "../signer-types";

const REQUEST_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 1024 * 1024;
const STDERR_LIMIT = 8 * 1024;
const MAX_TIMEOUT_MS = 120_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATIONS = new Set(["getAddress", "signMessage", "signTypedData", "signTransaction"]);

export interface ExternalSignerRequest {
  protocolVersion: 1;
  requestId: string;
  operation: "getAddress" | "signMessage" | "signTypedData" | "signTransaction";
  chainId: number;
  expectedAddress: Address;
  payload: Record<string, unknown>;
}

export interface ExternalSignerResponse {
  protocolVersion: 1;
  requestId: string;
  address: Address;
  signature?: Hex;
  signedTransaction?: Hex;
  transactionHash?: Hex;
}

interface ExternalSignerDependencies {
  executable: string;
  executableArgs?: string[];
  expectedAddress: Address;
  timeoutMs?: number;
  environment?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  allowedEnvironmentNames?: string[];
  securityMode?: "production" | "development";
}

function protocolJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString(10) : item,
  );
}

function safeStderr(value: Buffer): string {
  const printable = [...value.toString("utf8")]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");
  return printable.replace(/\b(?:wc|https?):\/\/\S+/gi, "[REDACTED]").slice(0, STDERR_LIMIT);
}

function validateRequest(request: ExternalSignerRequest): void {
  if (
    request.protocolVersion !== 1 ||
    !UUID.test(request.requestId) ||
    !OPERATIONS.has(request.operation)
  ) {
    throw new Error("EXTERNAL_SIGNER_INVALID_REQUEST: invalid protocol request.");
  }
}

function validateResponse(value: unknown, request: ExternalSignerRequest): ExternalSignerResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EXTERNAL_SIGNER_INVALID_RESPONSE: response must be an object.");
  }
  const response = value as Partial<ExternalSignerResponse>;
  if (
    response.protocolVersion !== 1 ||
    response.requestId !== request.requestId ||
    typeof response.address !== "string" ||
    response.address.toLowerCase() !== request.expectedAddress.toLowerCase()
  ) {
    throw new Error("EXTERNAL_SIGNER_INVALID_RESPONSE: response identity does not match.");
  }
  return response as ExternalSignerResponse;
}

export class ExternalSignerProvider implements SignerProvider {
  private readonly timeoutMs: number;

  constructor(private readonly dependencies: ExternalSignerDependencies) {
    if (!path.isAbsolute(dependencies.executable)) {
      throw new Error("EXTERNAL_SIGNER_EXECUTABLE: executable path must be absolute.");
    }
    this.timeoutMs = Math.min(Math.max(1, dependencies.timeoutMs ?? 30_000), MAX_TIMEOUT_MS);
  }

  async request(request: ExternalSignerRequest): Promise<ExternalSignerResponse> {
    validateRequest(request);
    const line = `${protocolJson(request)}\n`;
    if (Buffer.byteLength(line) > REQUEST_LIMIT) {
      throw new Error("EXTERNAL_SIGNER_REQUEST_LIMIT: request exceeds 1 MiB.");
    }
    const source = this.dependencies.environment ?? process.env;
    const environmentNames = new Set([
      "PATH",
      "HOME",
      "USERPROFILE",
      "SYSTEMROOT",
      "TMPDIR",
      "TEMP",
      "TMP",
      ...(this.dependencies.allowedEnvironmentNames ?? []),
    ]);
    const env = Object.fromEntries(
      [...environmentNames]
        .filter((name) => source[name] !== undefined)
        .map((name) => [name, source[name] as string]),
    );

    return new Promise<ExternalSignerResponse>((resolve, reject) => {
      const child = spawn(this.dependencies.executable, this.dependencies.executableArgs ?? [], {
        shell: false,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let terminationTimer: NodeJS.Timeout | undefined;

      const terminate = () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill("SIGTERM");
        terminationTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
        terminationTimer.unref();
      };
      const finish = (
        handler: (value: ExternalSignerResponse) => void,
        value: ExternalSignerResponse,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (terminationTimer) clearTimeout(terminationTimer);
        handler(value);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        terminate();
        reject(error);
      };
      const timeout = setTimeout(
        () => fail(new Error("EXTERNAL_SIGNER_TIMEOUT: provider exceeded its deadline.")),
        this.timeoutMs,
      );

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > RESPONSE_LIMIT) {
          fail(new Error("EXTERNAL_SIGNER_OUTPUT_LIMIT: stdout exceeds 1 MiB."));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrBytes >= STDERR_LIMIT) return;
        stderrBytes += chunk.length;
        stderr.push(chunk.subarray(0, STDERR_LIMIT - (stderrBytes - chunk.length)));
      });
      child.on("error", (error) =>
        fail(new Error(`EXTERNAL_SIGNER_START_FAILED: ${error.message}`)),
      );
      child.on("close", (code) => {
        if (settled) return;
        clearTimeout(timeout);
        if (terminationTimer) clearTimeout(terminationTimer);
        if (code !== 0) {
          const detail = safeStderr(Buffer.concat(stderr));
          fail(
            new Error(
              `EXTERNAL_SIGNER_FAILED: provider exited with code ${code}.${detail ? ` ${detail}` : ""}`,
            ),
          );
          return;
        }
        const output = Buffer.concat(stdout).toString("utf8");
        if (!output.endsWith("\n") || output.slice(0, -1).includes("\n")) {
          fail(new Error("EXTERNAL_SIGNER_INVALID_RESPONSE: expected one JSON line."));
          return;
        }
        try {
          const response = validateResponse(JSON.parse(output), request);
          finish(resolve, response);
        } catch (error) {
          fail(
            error instanceof Error
              ? error
              : new Error("EXTERNAL_SIGNER_INVALID_RESPONSE: invalid JSON."),
          );
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(line);
    });
  }

  async connect(input: {
    chain: Parameters<SignerProvider["connect"]>[0]["chain"];
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession> {
    const expectedAddress = input.expectedAddress ?? this.dependencies.expectedAddress;
    const invoke = (
      operation: ExternalSignerRequest["operation"],
      payload: Record<string, unknown>,
    ) =>
      this.request({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        operation,
        chainId: input.chain.id,
        expectedAddress,
        payload,
      });
    const identity = await invoke("getAddress", {});
    const address = identity.address;

    const verifiedSignature = async (
      operation: "signMessage" | "signTypedData" | "signTransaction",
      payload: Record<string, unknown>,
      digest: Hex,
    ): Promise<Hex> => {
      const response = await invoke(operation, payload);
      if (!response.signature) {
        throw new Error("EXTERNAL_SIGNER_INVALID_RESPONSE: signature is required.");
      }
      const recovered = await recoverAddress({ hash: digest, signature: response.signature });
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        throw new Error("EXTERNAL_SIGNER_SIGNATURE_MISMATCH: signature signer does not match.");
      }
      return response.signature;
    };

    const account = toAccount({
      address,
      signMessage: async ({ message }) =>
        verifiedSignature("signMessage", { message }, hashMessage(message)),
      signTypedData: async (typedData) =>
        verifiedSignature("signTypedData", { typedData }, hashTypedData(typedData)),
      signTransaction: async (transaction, options) => {
        const serializer = options?.serializer ?? serializeTransaction;
        const unsigned = await serializer(transaction);
        const signature = await verifiedSignature(
          "signTransaction",
          { transaction },
          keccak256(unsigned),
        );
        return serializer(transaction, parseSignature(signature));
      },
    });
    const walletClient = createWalletClient({
      account,
      chain: input.chain,
      transport: http(input.rpcUrl),
    }) as WalletClient;
    // Constructing the public client here validates the transport used for future
    // submitted-transaction verification without granting the provider RPC credentials.
    createPublicClient({ chain: input.chain, transport: http(input.rpcUrl) });
    return createSignerSession({
      type: "external",
      address,
      walletClient,
      capabilities: { transactions: true, messages: true, typedData: true },
      close: async () => undefined,
    });
  }
}
