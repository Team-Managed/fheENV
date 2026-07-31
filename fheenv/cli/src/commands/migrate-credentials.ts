import path from "path";
import { NativeCredentialStore, parseCredentialReference } from "../lib/credential-store";
import { MigrationResult, migrateConfigV1ToV2 } from "../lib/config-v2";
import { SignerConfig } from "../lib/config-v2";
import { CredentialStore } from "../lib/credential-types";

export interface MigrateCredentialsOptions {
  credentialRef: string;
  rpcCredentialRef?: string;
  securityMode: "production" | "development";
  signer: SignerConfig;
  dryRun?: boolean;
  configPath?: string;
  store?: CredentialStore;
}

function keyringKey(reference: string): string {
  const parsed = parseCredentialReference(reference);
  if (parsed.source !== "keyring") {
    throw new Error("Migration destinations must use keyring:// references.");
  }
  return parsed.key;
}

export async function migrateCredentialsCommand(
  options: MigrateCredentialsOptions,
): Promise<MigrationResult> {
  const store = options.store ?? new NativeCredentialStore();
  const references = [
    options.credentialRef,
    ...(options.rpcCredentialRef ? [options.rpcCredentialRef] : []),
  ];
  const keys = new Map(references.map((reference) => [reference, keyringKey(reference)]));
  const result = await migrateConfigV1ToV2(
    options.configPath ?? path.resolve(process.cwd(), ".fheenv.json"),
    {
      credentialRef: options.credentialRef,
      rpcCredentialRef: options.rpcCredentialRef,
      securityMode: options.securityMode,
      signer: options.signer,
      dryRun: options.dryRun,
      setCredential: (reference, value) => store.set(keys.get(reference) as string, value),
      readCredential: (reference) => store.get(keys.get(reference) as string),
    },
  );
  console.log(JSON.stringify(result, null, 2));
  return result;
}
