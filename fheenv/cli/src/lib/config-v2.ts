import crypto from "crypto";
import fs from "fs";
import path from "path";
import { isAddress } from "viem";
import { parseCredentialReference } from "./credential-store";
import { SecurityMode } from "./credential-types";

export type SignerConfig =
  | { type: "walletconnect"; credentialRef: string; expectedAddress?: string }
  | { type: "ledger"; derivationPath: string; expectedAddress?: string }
  | { type: "aws-kms"; keyId: string; expectedAddress: string }
  | { type: "external"; provider: string; expectedAddress: string }
  | { type: "local-encrypted"; expectedAddress?: string };

export interface FheEnvConfigV2 {
  version: 2;
  projectId: number;
  registryAddress: string;
  chainId: number;
  rpc: { url: string } | { credentialRef: string };
  deployedAtBlock?: number;
  securityMode: SecurityMode;
  signer: SignerConfig;
  storage: {
    provider: "pinata";
    credentialRef: string;
  };
}

interface FheEnvConfigV1 {
  projectId: number;
  registryAddress: string;
  rpcUrl: string;
  chainId: number;
  pinataJwt: string;
  deployedAtBlock?: number;
}

interface MigrationOptions {
  credentialRef: string;
  rpcCredentialRef?: string;
  securityMode: SecurityMode;
  signer: SignerConfig;
  dryRun?: boolean;
  setCredential(reference: string, value: string): Promise<void>;
  readCredential(reference: string): Promise<string | null>;
  proveSigner?(config: FheEnvConfigV2): Promise<void>;
}

export interface MigrationResult {
  fromVersion: 1;
  toVersion: 2;
  movedFields: string[];
  destinationReferences: string[];
  securityMode: SecurityMode;
  signerType: SignerConfig["type"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnexpectedFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  scope: string,
): void {
  const allowedFields = new Set(allowed);
  const unexpected = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unexpected) throw new Error(`Unexpected config field ${scope}.${unexpected}.`);
}

function requireInteger(value: unknown, name: string, minimum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${name} must be a safe integer greater than or equal to ${minimum}.`);
  }
}

function requireAddress(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${name} must be a valid Ethereum address.`);
  }
}

function validateOptionalAddress(value: unknown, name: string): void {
  if (value !== undefined) requireAddress(value, name);
}

function validatePublicRpcUrl(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new Error("RPC URL must be an HTTPS URL.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RPC URL must be an HTTPS URL.");
  }
  const hasSensitiveQuery = [...url.searchParams.keys()].some((key) =>
    /(key|token|secret|password|jwt|auth)/i.test(key),
  );
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    hasSensitiveQuery
  ) {
    throw new Error("RPC URL must be public HTTPS and contain no credentials.");
  }
}

function validateSigner(value: unknown): asserts value is SignerConfig {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Signer configuration is invalid.");
  }
  validateOptionalAddress(value.expectedAddress, "signer.expectedAddress");
  switch (value.type) {
    case "walletconnect":
      rejectUnexpectedFields(value, ["type", "credentialRef", "expectedAddress"], "signer");
      if (typeof value.credentialRef !== "string") {
        throw new Error("WalletConnect credential reference is required.");
      }
      parseCredentialReference(value.credentialRef);
      return;
    case "ledger":
      rejectUnexpectedFields(value, ["type", "derivationPath", "expectedAddress"], "signer");
      if (typeof value.derivationPath !== "string" || !value.derivationPath) {
        throw new Error("Ledger derivation path is required.");
      }
      return;
    case "aws-kms":
      rejectUnexpectedFields(value, ["type", "keyId", "expectedAddress"], "signer");
      if (typeof value.keyId !== "string" || !value.keyId) {
        throw new Error("AWS KMS key ID is required.");
      }
      requireAddress(value.expectedAddress, "signer.expectedAddress");
      return;
    case "external":
      rejectUnexpectedFields(value, ["type", "provider", "expectedAddress"], "signer");
      if (typeof value.provider !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value.provider)) {
        throw new Error("External signer provider is invalid.");
      }
      requireAddress(value.expectedAddress, "signer.expectedAddress");
      return;
    case "local-encrypted":
      rejectUnexpectedFields(value, ["type", "expectedAddress"], "signer");
      return;
    default:
      throw new Error("Signer type is unsupported.");
  }
}

export function validateConfigV2(value: unknown): FheEnvConfigV2 {
  if (!isRecord(value) || value.version !== 2) {
    throw new Error("Project config version must be 2.");
  }
  rejectUnexpectedFields(
    value,
    [
      "version",
      "projectId",
      "registryAddress",
      "chainId",
      "rpc",
      "deployedAtBlock",
      "securityMode",
      "signer",
      "storage",
    ],
    "root",
  );
  requireInteger(value.projectId, "projectId", 0);
  requireInteger(value.chainId, "chainId", 1);
  requireAddress(value.registryAddress, "registryAddress");
  if (value.deployedAtBlock !== undefined) {
    requireInteger(value.deployedAtBlock, "deployedAtBlock", 0);
  }
  if (value.securityMode !== "production" && value.securityMode !== "development") {
    throw new Error("securityMode must be production or development.");
  }
  if (!isRecord(value.rpc)) throw new Error("RPC configuration is invalid.");
  if (Object.keys(value.rpc).length !== 1) {
    throw new Error("RPC configuration must select exactly one source.");
  }
  if ("url" in value.rpc) {
    rejectUnexpectedFields(value.rpc, ["url"], "rpc");
    validatePublicRpcUrl(value.rpc.url);
  } else if (typeof value.rpc.credentialRef === "string") {
    rejectUnexpectedFields(value.rpc, ["credentialRef"], "rpc");
    parseCredentialReference(value.rpc.credentialRef);
  } else {
    throw new Error("RPC configuration is invalid.");
  }
  validateSigner(value.signer);
  if (
    !isRecord(value.storage) ||
    value.storage.provider !== "pinata" ||
    typeof value.storage.credentialRef !== "string"
  ) {
    throw new Error("Storage configuration is invalid.");
  }
  rejectUnexpectedFields(value.storage, ["provider", "credentialRef"], "storage");
  parseCredentialReference(value.storage.credentialRef);
  return value as unknown as FheEnvConfigV2;
}

export function readConfigV2(configPath: string): FheEnvConfigV2 {
  return validateConfigV2(JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown);
}

function readConfigV1(configPath: string): FheEnvConfigV1 {
  const value = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  if (!isRecord(value) || "version" in value) {
    throw new Error("Only version-1 project configs can be migrated.");
  }
  requireInteger(value.projectId, "projectId", 0);
  requireInteger(value.chainId, "chainId", 1);
  requireAddress(value.registryAddress, "registryAddress");
  if (value.deployedAtBlock !== undefined) {
    requireInteger(value.deployedAtBlock, "deployedAtBlock", 0);
  }
  if (typeof value.rpcUrl !== "string" || typeof value.pinataJwt !== "string" || !value.pinataJwt) {
    throw new Error("Version-1 project config is invalid.");
  }
  return value as unknown as FheEnvConfigV1;
}

function credentialsMatch(expected: string, actual: string | null): boolean {
  if (actual === null) return false;
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  const actualDigest = crypto.createHash("sha256").update(actual).digest();
  return crypto.timingSafeEqual(expectedDigest, actualDigest);
}

function writeConfigAtomically(configPath: string, config: FheEnvConfigV2): void {
  const temporaryPath = path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, configPath);
    fs.chmodSync(configPath, 0o644);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

export async function migrateConfigV1ToV2(
  configPath: string,
  options: MigrationOptions,
): Promise<MigrationResult> {
  const legacy = readConfigV1(configPath);
  parseCredentialReference(options.credentialRef);

  let rpc: FheEnvConfigV2["rpc"];
  try {
    validatePublicRpcUrl(legacy.rpcUrl);
    rpc = { url: legacy.rpcUrl };
  } catch {
    if (!options.rpcCredentialRef) {
      throw new Error("Credential-bearing RPC URL requires an RPC credential reference.");
    }
    parseCredentialReference(options.rpcCredentialRef);
    rpc = { credentialRef: options.rpcCredentialRef };
  }
  if (
    options.rpcCredentialRef &&
    "credentialRef" in rpc &&
    options.rpcCredentialRef === options.credentialRef
  ) {
    throw new Error("Storage and RPC credentials require distinct destination references.");
  }

  const moves = [
    { field: "pinataJwt", reference: options.credentialRef, value: legacy.pinataJwt },
    ...(options.rpcCredentialRef && "credentialRef" in rpc
      ? [{ field: "rpcUrl", reference: options.rpcCredentialRef, value: legacy.rpcUrl }]
      : []),
  ];
  const result: MigrationResult = {
    fromVersion: 1,
    toVersion: 2,
    movedFields: moves.map(({ field }) => field),
    destinationReferences: moves.map(({ reference }) => reference),
    securityMode: options.securityMode,
    signerType: options.signer.type,
  };
  const migrated = validateConfigV2({
    version: 2,
    projectId: legacy.projectId,
    registryAddress: legacy.registryAddress,
    chainId: legacy.chainId,
    rpc,
    deployedAtBlock: legacy.deployedAtBlock,
    securityMode: options.securityMode,
    signer: options.signer,
    storage: { provider: "pinata", credentialRef: options.credentialRef },
  });

  if (options.dryRun) return result;
  for (const move of moves) {
    await options.setCredential(move.reference, move.value);
    const stored = await options.readCredential(move.reference);
    if (!credentialsMatch(move.value, stored)) {
      throw new Error(`Credential verification failed for ${move.field}.`);
    }
  }
  await options.proveSigner?.(migrated);
  writeConfigAtomically(configPath, migrated);
  return result;
}
