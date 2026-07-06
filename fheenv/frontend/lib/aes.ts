const ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

export async function generateAesKey(): Promise<Uint8Array> {
  const key = await crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function aesEncrypt(plaintext: string, keyBytes: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    ALGO,
    false,
    ["encrypt"],
  );
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, cryptoKey, encoded);
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);
  return btoa(String.fromCharCode(...combined));
}

export async function aesDecrypt(base64Blob: string, keyBytes: Uint8Array): Promise<string> {
  const combined = Uint8Array.from(atob(base64Blob), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    ALGO,
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export function splitAesKeyToUint128(keyBytes: Uint8Array): [bigint, bigint] {
  if (keyBytes.length !== 32) throw new Error("AES key must be 32 bytes");
  const toUint128 = (b: Uint8Array) => b.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  return [toUint128(keyBytes.slice(0, 16)), toUint128(keyBytes.slice(16, 32))];
}

export function joinUint128ToAesKey(high: bigint, low: bigint): Uint8Array {
  const toBytes = (n: bigint): Uint8Array => {
    const bytes = new Uint8Array(16);
    for (let i = 15; i >= 0; i--) {
      bytes[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    return bytes;
  };
  const key = new Uint8Array(32);
  key.set(toBytes(high), 0);
  key.set(toBytes(low), 16);
  return key;
}
