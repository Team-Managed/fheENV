import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { LocalAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import os from "os";
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { getLitActionAddress, createLitAccount } from "./lit-signer";

const KEYFILE_PATH = path.join(os.homedir(), ".fheenv", "wallet.json");

// scrypt parameters — OWASP minimum for interactive credential storage (N=2^15)
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

interface KeyfileV1 {
  version?: undefined;
  privateKey: string;
}

// SOC 2 CC6.1 — encryption at rest: scrypt key derivation + AES-256-GCM
interface KeyfileV2 {
  version: 2;
  salt: string; // 32-byte hex
  iv: string; // 12-byte hex (GCM nonce)
  authTag: string; // 16-byte hex
  ciphertext: string; // hex-encoded encrypted private key
}

type Keyfile = KeyfileV1 | KeyfileV2;

function encryptKey(privateKey: string, passphrase: string): KeyfileV2 {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const derivedKey = scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 2,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

function decryptKey(keyfile: KeyfileV2, passphrase: string): string {
  const salt = Buffer.from(keyfile.salt, "hex");
  const iv = Buffer.from(keyfile.iv, "hex");
  const authTag = Buffer.from(keyfile.authTag, "hex");
  const ciphertext = Buffer.from(keyfile.ciphertext, "hex");
  const derivedKey = scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function loadAccountKey(): `0x${string}` {
  // Priority 1: raw key from env var (CI/CD — the platform secret store is responsible for this)
  const pk = process.env.FHEENV_PRIVATE_KEY;
  if (pk) return pk as `0x${string}`;

  if (!fs.existsSync(KEYFILE_PATH)) {
    throw new Error("No wallet found. Run `fheenv login` first or set FHEENV_PRIVATE_KEY.");
  }

  const keyfile = JSON.parse(fs.readFileSync(KEYFILE_PATH, "utf-8")) as Keyfile;

  // Version 2: scrypt + AES-256-GCM encrypted keyfile
  if (keyfile.version === 2) {
    const passphrase = process.env.FHEENV_KEY_PASSPHRASE;
    if (!passphrase) {
      throw new Error(
        "Keyfile is encrypted (v2). Set FHEENV_KEY_PASSPHRASE or run `fheenv login` to re-save.",
      );
    }
    try {
      return decryptKey(keyfile, passphrase) as `0x${string}`;
    } catch {
      throw new Error("Failed to decrypt keyfile — incorrect passphrase (FHEENV_KEY_PASSPHRASE).");
    }
  }

  // Version 1: legacy plaintext keyfile — backward-compatible with a deprecation warning
  if (process.stderr.isTTY) {
    process.stderr.write(
      "\x1b[33m⚠  Keyfile is unencrypted. Re-run `fheenv login` with a passphrase to encrypt it (SOC 2 CC6.1).\x1b[0m\n",
    );
  }
  return (keyfile as KeyfileV1).privateKey as `0x${string}`;
}

export function saveWallet(privateKey: string, passphrase?: string): void {
  const dir = path.dirname(KEYFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data: Keyfile = passphrase ? encryptKey(privateKey, passphrase) : { privateKey };
  fs.writeFileSync(KEYFILE_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export interface ViemClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: PrivateKeyAccount | LocalAccount;
}

export function createClients(rpcUrl: string, chainId: number): ViemClients {
  const chain: Chain = {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;

  const pk = loadAccountKey();
  const account = privateKeyToAccount(pk);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  }) as WalletClient;

  return { publicClient, walletClient, account };
}

/**
 * Create viem clients backed by the Lit Protocol signer (Finding F-01).
 * Called when FHEENV_LIT_ACTION_CID + FHEENV_LIT_API_KEY + GITHUB_OIDC_JWT
 * are all set — the Rotator private key never leaves the Lit TEE.
 */
export async function createLitClients(rpcUrl: string, chainId: number): Promise<ViemClients> {
  const actionCid = process.env.FHEENV_LIT_ACTION_CID!;
  const apiKey = process.env.FHEENV_LIT_API_KEY!;
  const oidcJwt = process.env.GITHUB_OIDC_JWT!;

  const chain: Chain = {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;

  const address = await getLitActionAddress(actionCid, apiKey);
  const account = createLitAccount(address, actionCid, apiKey, oidcJwt);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  }) as WalletClient;

  return { publicClient, walletClient, account };
}

/**
 * Returns true when all three Lit env vars are present — the rotate-check
 * command uses this to choose the Lit signer path over the private key path.
 */
export function isLitSigningConfigured(): boolean {
  return !!(
    process.env.FHEENV_LIT_ACTION_CID &&
    process.env.FHEENV_LIT_API_KEY &&
    process.env.GITHUB_OIDC_JWT
  );
}
