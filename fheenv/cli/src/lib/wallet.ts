import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

const KEYFILE_PATH = path.join(os.homedir(), ".fheenv", "wallet.json");
const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

interface LegacyKeyfile {
  privateKey: string;
}

interface EncryptedKeyfile {
  version: 2;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function assertPrivateKey(privateKey: string): asserts privateKey is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Invalid private key format. Must be a 0x-prefixed 32-byte hex string.");
  }
}

function encryptWallet(privateKey: string, passphrase: string): EncryptedKeyfile {
  if (!passphrase.trim()) throw new Error("Passphrase is required for encrypted wallet storage.");
  assertPrivateKey(privateKey);

  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT_OPTIONS);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);

  return {
    version: 2,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

function writeWalletAtomically(walletPath: string, keyfile: EncryptedKeyfile): void {
  const directory = path.dirname(walletPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${walletPath}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  let fileDescriptor: number | undefined;

  try {
    fileDescriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(fileDescriptor, JSON.stringify(keyfile, null, 2));
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(temporaryPath, walletPath);
    fs.chmodSync(walletPath, 0o600);
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

export function saveWallet(
  privateKey: string,
  passphrase: string,
  walletPath = KEYFILE_PATH,
): void {
  writeWalletAtomically(walletPath, encryptWallet(privateKey, passphrase));
}

export function loadWallet(
  passphrase: string,
  walletPath = KEYFILE_PATH,
): `0x${string}` {
  if (!fs.existsSync(walletPath)) {
    throw new Error("No wallet found. Run `fheenv login` first or set FHEENV_PRIVATE_KEY.");
  }

  const keyfile = JSON.parse(fs.readFileSync(walletPath, "utf8")) as
    | EncryptedKeyfile
    | LegacyKeyfile;
  if (!("version" in keyfile) || keyfile.version !== 2) {
    throw new Error(
      "Found a legacy plaintext wallet. Run `fheenv login --migrate` before continuing.",
    );
  }
  if (!passphrase) throw new Error("FHEENV_KEY_PASSPHRASE is required to unlock the wallet.");

  try {
    const key = scryptSync(passphrase, Buffer.from(keyfile.salt, "hex"), 32, SCRYPT_OPTIONS);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(keyfile.iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(keyfile.authTag, "hex"));
    const privateKey = Buffer.concat([
      decipher.update(Buffer.from(keyfile.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");
    assertPrivateKey(privateKey);
    return privateKey;
  } catch {
    throw new Error("Failed to decrypt wallet: incorrect passphrase or corrupt keyfile.");
  }
}

export function migrateLegacyWallet(
  passphrase: string,
  walletPath = KEYFILE_PATH,
): void {
  if (!fs.existsSync(walletPath)) throw new Error("No legacy wallet found to migrate.");
  const legacy = JSON.parse(fs.readFileSync(walletPath, "utf8")) as
    | EncryptedKeyfile
    | LegacyKeyfile;
  if ("version" in legacy) throw new Error("Wallet is already encrypted.");
  assertPrivateKey(legacy.privateKey);
  saveWallet(legacy.privateKey, passphrase, walletPath);
}

export function loadAccountKey(): `0x${string}` {
  const environmentKey = process.env.FHEENV_PRIVATE_KEY;
  if (environmentKey) {
    assertPrivateKey(environmentKey);
    return environmentKey;
  }
  return loadWallet(process.env.FHEENV_KEY_PASSPHRASE ?? "");
}

export interface ViemClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: PrivateKeyAccount;
}

export function createClients(rpcUrl: string, chainId: number): ViemClients {
  const account = privateKeyToAccount(loadAccountKey());
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
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  }) as WalletClient;

  return { publicClient, walletClient, account };
}
