import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function generateAesKeyNode(): Buffer {
  return randomBytes(32);
}

export function aesEncryptNode(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

export function aesDecryptNode(base64Blob: string, key: Buffer): string {
  const combined = Buffer.from(base64Blob, "base64");
  const iv = combined.slice(0, IV_LENGTH);
  const authTag = combined.slice(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.slice(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH,
  );
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function splitAesKeyToUint128Node(key: Buffer): [bigint, bigint] {
  const toUint128 = (b: Buffer): bigint =>
    b.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  return [toUint128(key.slice(0, 16)), toUint128(key.slice(16, 32))];
}

export function joinUint128ToAesKeyNode(high: bigint, low: bigint): Buffer {
  const toBytes = (n: bigint): Buffer => {
    const b = Buffer.alloc(16);
    let val = n;
    for (let i = 15; i >= 0; i--) {
      b[i] = Number(val & 0xffn);
      val >>= 8n;
    }
    return b;
  };
  return Buffer.concat([toBytes(high), toBytes(low)]);
}
