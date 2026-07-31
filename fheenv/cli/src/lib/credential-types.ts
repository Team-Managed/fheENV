export type SecurityMode = "production" | "development";

export type CredentialReference =
  | { source: "keyring"; key: string }
  | { source: "env"; variable: string }
  | { source: "exec"; provider: string; key: string };

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  probe(): Promise<{ available: boolean; backend: string; reason?: string }>;
}

export interface NativeKeyringBackend {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}
