import { Entry } from "@napi-rs/keyring";
import {
  CredentialReference,
  CredentialStore,
  NativeKeyringBackend,
  SecurityMode,
} from "./credential-types";
import { SensitiveValueRegistry } from "./redaction";

const SERVICE = "fheenv";
const MAX_REFERENCE_BYTES = 512;
const COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PROVIDER = /^[a-z0-9][a-z0-9-]*$/;
const ENVIRONMENT_VARIABLE = /^[A-Z_][A-Z0-9_]*$/;

class NapiKeyringBackend implements NativeKeyringBackend {
  async get(service: string, account: string): Promise<string | null> {
    return new Entry(service, account).getPassword();
  }

  async set(service: string, account: string, value: string): Promise<void> {
    new Entry(service, account).setPassword(value);
  }

  async delete(service: string, account: string): Promise<void> {
    new Entry(service, account).deletePassword();
  }
}

function isValidPath(value: string): boolean {
  return value.split("/").every((component) => COMPONENT.test(component) && component !== "..");
}

function invalidReference(): never {
  throw new Error("Invalid credential reference.");
}

function validateReferenceInput(reference: string): void {
  const hasControlCharacter = [...reference].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (Buffer.byteLength(reference, "utf8") > MAX_REFERENCE_BYTES || hasControlCharacter) {
    invalidReference();
  }
}

export function parseCredentialReference(reference: string): CredentialReference {
  validateReferenceInput(reference);

  if (reference.startsWith("keyring://")) {
    const key = reference.slice("keyring://".length);
    if (!key || !isValidPath(key)) invalidReference();
    return { source: "keyring", key };
  }

  if (reference.startsWith("env://")) {
    const variable = reference.slice("env://".length);
    if (!ENVIRONMENT_VARIABLE.test(variable)) invalidReference();
    return { source: "env", variable };
  }

  if (reference.startsWith("exec://")) {
    const value = reference.slice("exec://".length);
    const separator = value.indexOf("/");
    const provider = value.slice(0, separator);
    const key = value.slice(separator + 1);
    if (separator < 1 || !PROVIDER.test(provider) || !key || !isValidPath(key)) {
      invalidReference();
    }
    return { source: "exec", provider, key };
  }

  return invalidReference();
}

function backendName(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS Keychain";
    case "win32":
      return "Windows Credential Manager";
    case "linux":
      return "Linux Secret Service";
    default:
      return "native keyring";
  }
}

export class NativeCredentialStore implements CredentialStore {
  constructor(
    private readonly backend: NativeKeyringBackend = new NapiKeyringBackend(),
    private readonly name = backendName(),
  ) {}

  get(key: string): Promise<string | null> {
    if (!isValidPath(key)) invalidReference();
    return this.backend.get(SERVICE, key);
  }

  set(key: string, value: string): Promise<void> {
    if (!isValidPath(key)) invalidReference();
    return this.backend.set(SERVICE, key, value);
  }

  delete(key: string): Promise<void> {
    if (!isValidPath(key)) invalidReference();
    return this.backend.delete(SERVICE, key);
  }

  async probe(): Promise<{ available: boolean; backend: string; reason?: string }> {
    try {
      await this.backend.get(SERVICE, "__probe__");
      return { available: true, backend: this.name };
    } catch (error) {
      return {
        available: false,
        backend: this.name,
        reason: error instanceof Error ? error.message : "Unknown keyring error",
      };
    }
  }
}

interface CredentialResolutionDependencies {
  mode?: SecurityMode;
  keyring?: CredentialStore;
  environment?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  externalSecretProvider?: {
    resolve(provider: string, key: string): Promise<string | null>;
  };
  registry?: SensitiveValueRegistry;
}

function requireValue(value: string | null | undefined): string {
  if (!value) throw new Error("Credential value is unavailable.");
  return value;
}

export async function resolveCredential(
  reference: CredentialReference,
  dependencies: CredentialResolutionDependencies,
): Promise<string> {
  let value: string;
  switch (reference.source) {
    case "keyring":
      value = requireValue(await dependencies.keyring?.get(reference.key));
      break;
    case "env":
      if (dependencies.mode === "production" && reference.variable === "FHEENV_PRIVATE_KEY") {
        throw new Error("Raw private-key environment references are disabled in production.");
      }
      value = requireValue(dependencies.environment?.[reference.variable]);
      break;
    case "exec":
      value = requireValue(
        await dependencies.externalSecretProvider?.resolve(reference.provider, reference.key),
      );
      break;
  }
  dependencies.registry?.register(value);
  return value;
}
