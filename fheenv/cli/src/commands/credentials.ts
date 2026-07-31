import readline from "readline";
import { NativeCredentialStore, parseCredentialReference } from "../lib/credential-store";
import { CredentialStore } from "../lib/credential-types";
import { promptSecret as hiddenPrompt } from "./login";

interface CredentialCommandStore {
  get?(key: string): Promise<string | null>;
  set?(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
  probe?(): Promise<{ available: boolean; backend: string; reason?: string }>;
}

interface CredentialDependencies {
  store?: CredentialCommandStore;
  environment?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  promptSecret?: (prompt: string) => Promise<string>;
  readStdin?: () => Promise<string>;
  confirm?: (prompt: string) => Promise<boolean>;
  stdinIsTty?: boolean;
}

function keyringKey(reference: string): string {
  const parsed = parseCredentialReference(reference);
  if (parsed.source !== "keyring") {
    throw new Error("Credential writes require a keyring:// reference.");
  }
  return parsed.key;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      value += chunk;
      if (Buffer.byteLength(value) > 1024 * 1024) {
        reject(new Error("Credential input exceeds 1 MiB."));
      }
    });
    process.stdin.on("end", () => resolve(value.replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
    process.stdin.resume();
  });
}

function confirmOnTty(prompt: string): Promise<boolean> {
  const interface_ = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    interface_.question(`${prompt} [y/N] `, (answer) => {
      interface_.close();
      resolve(/^y(?:es)?$/i.test(answer.trim()));
    });
  });
}

export async function setCredential(
  options: { reference: string; stdin?: boolean },
  dependencies: CredentialDependencies = {},
): Promise<{ reference: string; stored: true }> {
  const key = keyringKey(options.reference);
  const store = dependencies.store ?? new NativeCredentialStore();
  if (!store.set) throw new Error("Credential store does not support writes.");
  const tty = dependencies.stdinIsTty ?? process.stdin.isTTY;
  let value: string;
  if (options.stdin) {
    value = await (dependencies.readStdin ?? readAllStdin)();
  } else {
    if (!tty && !dependencies.promptSecret) {
      throw new Error("Non-interactive credential input requires --stdin.");
    }
    value = await (dependencies.promptSecret ?? hiddenPrompt)("Credential value (input hidden): ");
  }
  if (!value) throw new Error("Credential value cannot be empty.");
  await store.set(key, value);
  return { reference: options.reference, stored: true };
}

export async function credentialStatus(
  options: { reference?: string },
  dependencies: CredentialDependencies = {},
): Promise<{
  reference?: string;
  source?: string;
  present?: boolean | null;
  available?: boolean;
  backend: string;
  reason?: string;
}> {
  const store = dependencies.store ?? new NativeCredentialStore();
  if (!options.reference) {
    if (!store.probe) throw new Error("Credential store does not support status checks.");
    return store.probe();
  }
  const parsed = parseCredentialReference(options.reference);
  if (parsed.source === "keyring") {
    if (!store.get || !store.probe) {
      throw new Error("Credential store does not support status checks.");
    }
    const [value, probe] = await Promise.all([store.get(parsed.key), store.probe()]);
    return {
      reference: options.reference,
      source: parsed.source,
      present: value !== null,
      backend: probe.backend,
    };
  }
  if (parsed.source === "env") {
    return {
      reference: options.reference,
      source: parsed.source,
      present: Boolean((dependencies.environment ?? process.env)[parsed.variable]),
      backend: "environment",
    };
  }
  return {
    reference: options.reference,
    source: parsed.source,
    present: null,
    backend: `external provider ${parsed.provider}`,
  };
}

export async function deleteCredential(
  options: { reference: string; yes?: boolean },
  dependencies: CredentialDependencies = {},
): Promise<{ reference: string; deleted: true }> {
  const key = keyringKey(options.reference);
  const store = dependencies.store ?? (new NativeCredentialStore() as CredentialStore);
  if (!store.delete) throw new Error("Credential store does not support deletion.");
  if (!options.yes) {
    const tty = dependencies.stdinIsTty ?? process.stdin.isTTY;
    if (!tty) throw new Error("Non-interactive credential deletion requires --yes.");
    const confirmed = await (dependencies.confirm ?? confirmOnTty)(`Delete ${options.reference}?`);
    if (!confirmed) throw new Error("Credential deletion cancelled.");
  }
  await store.delete(key);
  return { reference: options.reference, deleted: true };
}
