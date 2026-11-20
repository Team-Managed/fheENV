import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  SigningAlgorithmSpec,
} from "@aws-sdk/client-kms";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  Address,
  bytesToHex,
  createWalletClient,
  getAddress,
  hashMessage,
  hashTypedData,
  Hex,
  http,
  keccak256,
  serializeSignature,
  serializeTransaction,
  Signature,
  WalletClient,
} from "viem";
import { toAccount } from "viem/accounts";
import {
  assertTransactionAllowed,
  normalizeSigningPolicy,
  SerializedSigningPolicy,
  SigningPolicy,
} from "../signing-policy";
import { createSignerSession, SignerProvider, SignerSession } from "../signer-types";

const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_CURVE_ORDER = CURVE_ORDER / 2n;
const SECP256K1_SPKI_PREFIX = Buffer.from("3056301006072a8648ce3d020106052b8104000a034200", "hex");

export interface KmsBoundary {
  getPublicKey(): Promise<Buffer>;
  signDigest(digest: Buffer): Promise<Buffer>;
}

interface AwsKmsSignerDependencies {
  keyId: string;
  policy: SigningPolicy | SerializedSigningPolicy;
  kms?: KmsBoundary;
}

export type CompletedKmsSignature = Signature & { recoveredAddress: Address };

function publicKeyFromDer(der: Buffer): Uint8Array {
  if (
    der.length !== SECP256K1_SPKI_PREFIX.length + 65 ||
    !der.subarray(0, SECP256K1_SPKI_PREFIX.length).equals(SECP256K1_SPKI_PREFIX)
  ) {
    throw new Error("AWS_KMS_INVALID_PUBLIC_KEY: expected a secp256k1 SPKI public key.");
  }
  const publicKey = der.subarray(SECP256K1_SPKI_PREFIX.length);
  if (publicKey[0] !== 4 || !secp256k1.utils.isValidPublicKey(publicKey, false)) {
    throw new Error("AWS_KMS_INVALID_PUBLIC_KEY: invalid secp256k1 point.");
  }
  return publicKey;
}

function addressFromPublicKey(publicKey: Uint8Array): Address {
  const hash = keccak256(bytesToHex(publicKey.subarray(1)));
  return getAddress(`0x${hash.slice(-40)}`);
}

function parseDerInteger(der: Buffer, offset: number): { value: bigint; next: number } {
  if (der[offset] !== 0x02) throw new Error("AWS_KMS_INVALID_SIGNATURE: expected DER integer.");
  const length = der[offset + 1];
  const start = offset + 2;
  const end = start + length;
  if (!length || length > 33 || end > der.length) {
    throw new Error("AWS_KMS_INVALID_SIGNATURE: invalid DER integer length.");
  }
  const value = der.subarray(start, end);
  if ((value[0] & 0x80) !== 0) {
    throw new Error("AWS_KMS_INVALID_SIGNATURE: negative DER integer.");
  }
  if (value.length > 1 && value[0] === 0 && (value[1] & 0x80) === 0) {
    throw new Error("AWS_KMS_INVALID_SIGNATURE: non-minimal DER integer.");
  }
  return { value: BigInt(`0x${value.toString("hex")}`), next: end };
}

function parseDerSignature(der: Buffer): { r: bigint; s: bigint } {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2 || der[1] >= 0x80) {
    throw new Error("AWS_KMS_INVALID_SIGNATURE: invalid DER sequence.");
  }
  const r = parseDerInteger(der, 2);
  const s = parseDerInteger(der, r.next);
  if (s.next !== der.length || r.value === 0n || s.value === 0n) {
    throw new Error("AWS_KMS_INVALID_SIGNATURE: invalid DER signature.");
  }
  if (r.value >= CURVE_ORDER || s.value >= CURVE_ORDER) {
    throw new Error("AWS_KMS_INVALID_SIGNATURE: scalar is outside the curve order.");
  }
  return { r: r.value, s: s.value };
}

function toPaddedHex(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export function completeKmsSignature(input: {
  digest: Hex;
  publicKeyDer: Buffer;
  signatureDer: Buffer;
  expectedAddress?: Address;
}): CompletedKmsSignature {
  const digest = Buffer.from(input.digest.slice(2), "hex");
  if (digest.length !== 32) throw new Error("AWS_KMS_INVALID_DIGEST: digest must be 32 bytes.");
  const publicKey = publicKeyFromDer(input.publicKeyDer);
  const { r, s: originalS } = parseDerSignature(input.signatureDer);
  const s = originalS > HALF_CURVE_ORDER ? CURVE_ORDER - originalS : originalS;
  const expectedPublicKey = Buffer.from(publicKey).toString("hex");
  let yParity: 0 | 1 | undefined;
  for (const recovery of [0, 1] as const) {
    try {
      const recovered = new secp256k1.Signature(r, s, recovery)
        .recoverPublicKey(digest)
        .toBytes(false);
      if (Buffer.from(recovered).toString("hex") === expectedPublicKey) {
        yParity = recovery;
        break;
      }
    } catch {
      // Try the other Ethereum recovery parity.
    }
  }
  if (yParity === undefined) {
    throw new Error("AWS_KMS_SIGNATURE_MISMATCH: signature does not match the KMS public key.");
  }
  const recoveredAddress = addressFromPublicKey(publicKey);
  if (
    input.expectedAddress &&
    recoveredAddress.toLowerCase() !== input.expectedAddress.toLowerCase()
  ) {
    throw new Error("AWS_KMS_ADDRESS_MISMATCH: KMS key does not match the configured address.");
  }
  return {
    r: toPaddedHex(r),
    s: toPaddedHex(s),
    yParity,
    v: BigInt(yParity + 27),
    recoveredAddress,
  };
}

class AwsSdkKmsBoundary implements KmsBoundary {
  private readonly client = new KMSClient({});

  constructor(private readonly keyId: string) {}

  async getPublicKey(): Promise<Buffer> {
    const response = await this.client.send(new GetPublicKeyCommand({ KeyId: this.keyId }));
    if (!response.PublicKey || response.KeySpec !== "ECC_SECG_P256K1") {
      throw new Error("AWS_KMS_INVALID_PUBLIC_KEY: key must use ECC_SECG_P256K1.");
    }
    return Buffer.from(response.PublicKey);
  }

  async signDigest(digest: Buffer): Promise<Buffer> {
    const response = await this.client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: digest,
        MessageType: "DIGEST",
        SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
      }),
    );
    if (!response.Signature) throw new Error("AWS_KMS_EMPTY_SIGNATURE: KMS returned no signature.");
    return Buffer.from(response.Signature);
  }
}

function isNormalizedPolicy(
  policy: SigningPolicy | SerializedSigningPolicy,
): policy is SigningPolicy {
  return typeof policy.maxGas === "bigint";
}

export class AwsKmsSignerProvider implements SignerProvider {
  private readonly kms: KmsBoundary;
  private readonly policy: SigningPolicy;

  constructor(private readonly dependencies: AwsKmsSignerDependencies) {
    this.kms = dependencies.kms ?? new AwsSdkKmsBoundary(dependencies.keyId);
    this.policy = isNormalizedPolicy(dependencies.policy)
      ? dependencies.policy
      : normalizeSigningPolicy(dependencies.policy);
  }

  async connect(input: {
    chain: Parameters<SignerProvider["connect"]>[0]["chain"];
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession> {
    const publicKeyDer = await this.kms.getPublicKey();
    const address = addressFromPublicKey(publicKeyFromDer(publicKeyDer));
    const expectedAddress = input.expectedAddress ?? address;
    if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error("AWS_KMS_ADDRESS_MISMATCH: KMS key does not match the configured address.");
    }
    const signDigest = async (digest: Hex): Promise<Signature> => {
      const signatureDer = await this.kms.signDigest(Buffer.from(digest.slice(2), "hex"));
      return completeKmsSignature({
        digest,
        publicKeyDer,
        signatureDer,
        expectedAddress,
      });
    };
    const account = toAccount({
      address,
      signMessage: async ({ message }) =>
        serializeSignature(await signDigest(hashMessage(message))),
      signTypedData: async (typedData) =>
        serializeSignature(await signDigest(hashTypedData(typedData))),
      signTransaction: async (transaction, options) => {
        assertTransactionAllowed(transaction, this.policy);
        const serializer = options?.serializer ?? serializeTransaction;
        const unsigned = await serializer(transaction);
        return serializer(transaction, await signDigest(keccak256(unsigned)));
      },
    });
    const walletClient = createWalletClient({
      account,
      chain: input.chain,
      transport: http(input.rpcUrl),
    }) as WalletClient;
    return createSignerSession({
      type: "aws-kms",
      address,
      walletClient,
      capabilities: { transactions: true, messages: true, typedData: true },
      close: async () => undefined,
    });
  }
}
