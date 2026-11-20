import {
  Address,
  bytesToHex,
  Chain,
  createWalletClient,
  hashMessage,
  hashTypedData,
  Hex,
  http,
  keccak256,
  pad,
  recoverAddress,
  serializeSignature,
  serializeTransaction,
  Signature,
  WalletClient,
} from "viem";
import { toAccount } from "viem/accounts";
import {
  DeviceActionState,
  DeviceActionStatus,
  DeviceManagementKitBuilder,
} from "@ledgerhq/device-management-kit";
import { nodeHidTransportFactory } from "@ledgerhq/device-transport-kit-node-hid";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { filter, firstValueFrom, Observable, take, timeout } from "rxjs";
import { createSignerSession, SignerProvider, SignerSession } from "../signer-types";

interface LedgerSignature {
  r: Hex;
  s: Hex;
  v: number;
}

export interface LedgerDevice {
  getAddress(path: string, display: boolean, chainId: number): Promise<Address>;
  signTransaction(path: string, serialized: Hex): Promise<LedgerSignature>;
  signMessage(path: string, message: Hex): Promise<LedgerSignature>;
  signTypedData(path: string, typedData: unknown): Promise<LedgerSignature>;
  close(): Promise<void>;
}

interface LedgerDependencies {
  derivationPath: string;
  device?: Partial<LedgerDevice> & Pick<LedgerDevice, "getAddress" | "close">;
  createDevice?: () => Promise<LedgerDevice>;
  displayAddress?: boolean;
}

export class LedgerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    if (cause !== undefined) Object.assign(this, { cause });
  }
}

function canonicalSignature(signature: LedgerSignature): Signature {
  const yParity = signature.v === 27 || signature.v === 28 ? signature.v - 27 : signature.v;
  if (yParity !== 0 && yParity !== 1) {
    throw new LedgerError("LEDGER_INVALID_SIGNATURE", "Ledger returned an invalid recovery value.");
  }
  return {
    r: pad(signature.r, { size: 32 }),
    s: pad(signature.s, { size: 32 }),
    yParity,
    v: BigInt(yParity + 27),
  };
}

async function verifiedSignature(
  signature: LedgerSignature,
  hash: Hex,
  expectedAddress: Address,
): Promise<Signature> {
  const canonical = canonicalSignature(signature);
  const recovered = await recoverAddress({
    hash,
    signature: canonical,
  });
  if (recovered.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new LedgerError(
      "LEDGER_SIGNATURE_MISMATCH",
      "Ledger signature does not recover the configured address.",
    );
  }
  return canonical;
}

function mapLedgerError(error: unknown): LedgerError {
  if (error instanceof LedgerError) return error;
  const value = error as {
    statusCode?: number;
    status?: number;
    code?: string;
    message?: string;
  };
  const status = value?.statusCode ?? value?.status;
  if (status === 0x6e00) {
    return new LedgerError(
      "LEDGER_ETHEREUM_APP_REQUIRED",
      "Open the Ethereum app on the Ledger device.",
      error,
    );
  }
  if (status === 0x6985) {
    return new LedgerError("LEDGER_REJECTED", "The Ledger request was rejected.", error);
  }
  if (value?.code === "TYPED_DATA_UNSUPPORTED") {
    return new LedgerError(
      "LEDGER_TYPED_DATA_UNSUPPORTED",
      "The Ledger device does not support this typed data.",
      error,
    );
  }
  if (value?.code === "DEVICE_DISCONNECTED") {
    return new LedgerError(
      "LEDGER_DISCONNECTED",
      "Ledger disconnected during the operation.",
      error,
    );
  }
  return new LedgerError(
    "LEDGER_DEVICE_ERROR",
    value?.message ?? "Ledger device operation failed.",
    error,
  );
}

async function completeAction<T>(action: {
  observable: Observable<DeviceActionState<T, unknown, unknown>>;
}): Promise<T> {
  const state = await firstValueFrom(
    action.observable.pipe(
      filter(
        (value) =>
          value.status === DeviceActionStatus.Completed ||
          value.status === DeviceActionStatus.Error ||
          value.status === DeviceActionStatus.Stopped,
      ),
      take(1),
      timeout({ first: 120_000 }),
    ),
  );
  if (state.status === DeviceActionStatus.Completed) return state.output;
  if (state.status === DeviceActionStatus.Error) throw state.error;
  throw new LedgerError("LEDGER_DISCONNECTED", "Ledger action stopped before completion.");
}

export async function createNodeHidLedgerDevice(): Promise<LedgerDevice> {
  const dmk = new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build();
  let discovered;
  try {
    discovered = await firstValueFrom(
      dmk.startDiscovering({}).pipe(take(1), timeout({ first: 10_000 })),
    );
  } catch (error) {
    throw new LedgerError("LEDGER_NOT_FOUND", "No Ledger device was found over USB HID.", error);
  } finally {
    await dmk.stopDiscovering().catch(() => undefined);
  }
  const sessionId = await dmk.connect({ device: discovered });
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();
  return {
    async getAddress(path, display, chainId) {
      const output = await completeAction(
        signer.getAddress(path, {
          checkOnDevice: display,
          returnChainCode: false,
          chainId,
        }),
      );
      return output.address;
    },
    async signTransaction(path, serialized) {
      return completeAction(signer.signTransaction(path, Buffer.from(serialized.slice(2), "hex")));
    },
    async signMessage(path, message) {
      return completeAction(signer.signMessage(path, Buffer.from(message.slice(2), "hex")));
    },
    async signTypedData(path, typedData) {
      return completeAction(
        signer.signTypedData(path, typedData as Parameters<typeof signer.signTypedData>[1]),
      );
    },
    close: () => dmk.disconnect({ sessionId }),
  };
}

export class LedgerSignerProvider implements SignerProvider {
  constructor(private readonly dependencies: LedgerDependencies) {}

  async connect(input: {
    chain: Chain;
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession> {
    let device: LedgerDevice | undefined;
    try {
      device = this.dependencies.device as LedgerDevice | undefined;
      device ??= await (this.dependencies.createDevice ?? createNodeHidLedgerDevice)();
      if (!device) {
        throw new LedgerError("LEDGER_NOT_FOUND", "No Ledger device was found.");
      }
      const path = this.dependencies.derivationPath;
      const address = await device.getAddress(
        path,
        this.dependencies.displayAddress ?? true,
        input.chain.id,
      );
      if (input.expectedAddress && address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
        throw new LedgerError(
          "LEDGER_ADDRESS_MISMATCH",
          "Ledger address does not match the configured address.",
        );
      }
      const account = toAccount({
        address,
        signMessage: async ({ message }) => {
          const encoded =
            typeof message === "string"
              ? bytesToHex(Buffer.from(message, "utf8"))
              : typeof message.raw === "string"
                ? message.raw
                : bytesToHex(message.raw);
          try {
            const signature = await device!.signMessage(path, encoded);
            return serializeSignature(
              await verifiedSignature(signature, hashMessage(message), address),
            );
          } catch (error) {
            throw mapLedgerError(error);
          }
        },
        signTransaction: async (transaction, options) => {
          const serializer = options?.serializer ?? serializeTransaction;
          const unsigned = await serializer(transaction);
          try {
            const signature = await device!.signTransaction(path, unsigned);
            const canonical = await verifiedSignature(signature, keccak256(unsigned), address);
            return await serializer(transaction, canonical);
          } catch (error) {
            throw mapLedgerError(error);
          }
        },
        signTypedData: async (typedData) => {
          try {
            const signature = await device!.signTypedData(path, typedData);
            return serializeSignature(
              await verifiedSignature(signature, hashTypedData(typedData), address),
            );
          } catch (error) {
            throw mapLedgerError(error);
          }
        },
      });
      const walletClient = createWalletClient({
        account,
        chain: input.chain,
        transport: http(input.rpcUrl),
      }) as WalletClient;
      return createSignerSession({
        type: "ledger",
        address,
        walletClient,
        capabilities: {
          transactions: true,
          messages: true,
          typedData: true,
        },
        close: () => device!.close(),
      });
    } catch (error) {
      await device?.close().catch(() => undefined);
      throw mapLedgerError(error);
    }
  }
}
