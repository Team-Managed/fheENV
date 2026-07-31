import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { CredentialStore } from "./credential-types";

const STATE_KEY = "walletconnect/state-key";
const DEFAULT_INSTALLATION_ID_PATH = path.join(os.homedir(), ".fheenv", "installation-id");

export function loadInstallationId(installationIdPath = DEFAULT_INSTALLATION_ID_PATH): string {
  if (fs.existsSync(installationIdPath)) {
    const value = fs.readFileSync(installationIdPath, "utf8").trim();
    if (/^[0-9a-f-]{36}$/i.test(value)) return value;
    throw new Error("fheENV installation ID is invalid.");
  }
  fs.mkdirSync(path.dirname(installationIdPath), {
    recursive: true,
    mode: 0o700,
  });
  const value = crypto.randomUUID();
  fs.writeFileSync(installationIdPath, `${value}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return value;
}

interface StateEnvelope {
  version: 1;
  installationId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface WalletConnectStateOptions {
  credentials: CredentialStore;
  installationId: string;
  statePath?: string;
}

export interface WalletConnectKeyValueStorage {
  getKeys(): Promise<string[]>;
  getEntries<T = unknown>(): Promise<[string, T][]>;
  getItem<T = unknown>(key: string): Promise<T | undefined>;
  setItem<T = unknown>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear?(): Promise<void>;
}

export interface WalletConnectStateResult {
  state: string | null;
  warningCode?: "WALLETCONNECT_STATE_CORRUPT" | "WALLETCONNECT_STATE_KEY_MISSING";
}

function metadata(installationId: string): Buffer {
  return Buffer.from(JSON.stringify({ version: 1, installationId }), "utf8");
}

export class WalletConnectStateStore {
  private readonly statePath: string;

  constructor(private readonly options: WalletConnectStateOptions) {
    this.statePath =
      options.statePath ?? path.join(os.homedir(), ".fheenv", "walletconnect-state.v1");
  }

  async save(state: string): Promise<void> {
    let encodedKey = await this.options.credentials.get(STATE_KEY);
    if (!encodedKey) {
      encodedKey = crypto.randomBytes(32).toString("hex");
      await this.options.credentials.set(STATE_KEY, encodedKey);
    }
    const key = this.decodeKey(encodedKey);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(metadata(this.options.installationId));
    const ciphertext = Buffer.concat([cipher.update(state, "utf8"), cipher.final()]);
    const envelope: StateEnvelope = {
      version: 1,
      installationId: this.options.installationId,
      iv: iv.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"),
      ciphertext: ciphertext.toString("hex"),
    };
    this.writeAtomically(`${JSON.stringify(envelope)}\n`);
  }

  async load(): Promise<WalletConnectStateResult> {
    if (!fs.existsSync(this.statePath)) return { state: null };
    const encodedKey = await this.options.credentials.get(STATE_KEY);
    if (!encodedKey) {
      this.quarantine();
      return {
        state: null,
        warningCode: "WALLETCONNECT_STATE_KEY_MISSING",
      };
    }
    try {
      const envelope = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as StateEnvelope;
      if (envelope.version !== 1 || envelope.installationId !== this.options.installationId) {
        throw new Error("WalletConnect state metadata mismatch.");
      }
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.decodeKey(encodedKey),
        Buffer.from(envelope.iv, "hex"),
      );
      decipher.setAAD(metadata(this.options.installationId));
      decipher.setAuthTag(Buffer.from(envelope.authTag, "hex"));
      const state = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "hex")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(state) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("WalletConnect state payload is invalid.");
      }
      return { state };
    } catch {
      this.quarantine();
      return { state: null, warningCode: "WALLETCONNECT_STATE_CORRUPT" };
    }
  }

  private decodeKey(encoded: string): Buffer {
    if (!/^[0-9a-fA-F]{64}$/.test(encoded)) {
      throw new Error("WalletConnect state key is invalid.");
    }
    return Buffer.from(encoded, "hex");
  }

  private writeAtomically(contents: string): void {
    const directory = path.dirname(this.statePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.statePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(descriptor, contents, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporaryPath, this.statePath);
      fs.chmodSync(this.statePath, 0o600);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
  }

  private quarantine(): void {
    const quarantinePath = `${this.statePath}.corrupt-${Date.now()}-${crypto.randomUUID()}`;
    fs.renameSync(this.statePath, quarantinePath);
    fs.chmodSync(quarantinePath, 0o600);
  }
}

export class EncryptedWalletConnectStorage implements WalletConnectKeyValueStorage {
  private values: Record<string, unknown> | undefined;

  constructor(
    private readonly stateStore: WalletConnectStateStore,
    private readonly warn: (code: string) => void = console.warn,
  ) {}

  async getKeys(): Promise<string[]> {
    await this.load();
    return Object.keys(this.values as Record<string, unknown>);
  }

  async getEntries<T = unknown>(): Promise<[string, T][]> {
    await this.load();
    return Object.entries(this.values as Record<string, unknown>) as [string, T][];
  }

  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    await this.load();
    return (this.values as Record<string, unknown>)[key] as T | undefined;
  }

  async setItem<T = unknown>(key: string, value: T): Promise<void> {
    await this.load();
    (this.values as Record<string, unknown>)[key] = value;
    await this.persist();
  }

  async removeItem(key: string): Promise<void> {
    await this.load();
    delete (this.values as Record<string, unknown>)[key];
    await this.persist();
  }

  async clear(): Promise<void> {
    this.values = {};
    await this.persist();
  }

  private async load(): Promise<void> {
    if (this.values) return;
    const result = await this.stateStore.load();
    if (result.warningCode) this.warn(result.warningCode);
    if (!result.state) {
      this.values = {};
      return;
    }
    const parsed = JSON.parse(result.state) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("WALLETCONNECT_STATE_CORRUPT: invalid state payload.");
    }
    this.values = parsed as Record<string, unknown>;
  }

  private persist(): Promise<void> {
    return this.stateStore.save(JSON.stringify(this.values));
  }
}
