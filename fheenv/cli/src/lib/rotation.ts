import type { Address } from "viem";
import type { EnvironmentData, InEuint128 } from "./contracts-node";

export interface RotationInput {
  envName: string;
  envContent: string;
  excludeMembers?: Address[];
}

export interface RotationDependencies {
  getEnvironment(): Promise<Pick<EnvironmentData, "blobCid" | "version">>;
  getActiveMembers(): Promise<Address[]>;
  generateAesKey(): Buffer;
  encryptBlob(content: string, key: Buffer): string;
  splitKey(key: Buffer): [bigint, bigint];
  uploadBlob(blob: string): Promise<string>;
  encryptKeyHalf(value: bigint): Promise<InEuint128>;
  updateEnvironment(params: {
    inKeyHigh: InEuint128;
    inKeyLow: InEuint128;
    blobCid: string;
    expectedVersion: bigint;
  }): Promise<void>;
  batchGrantAccess(members: Address[]): Promise<void>;
}

export interface RotationResult {
  previousCid: string;
  newCid: string;
  previousVersion: bigint;
  newVersion: bigint;
  membersRegranted: Address[];
}

export class PartialRotationError extends Error {
  constructor(
    message: string,
    readonly newCid: string,
    readonly newVersion: bigint,
    readonly recoveryCommand: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PartialRotationError";
  }
}

export async function grantMembersInBatches(
  members: Address[],
  grantBatch: (members: Address[]) => Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < members.length; offset += 100) {
    await grantBatch(members.slice(offset, offset + 100));
  }
}

export async function rotateEnvironment(
  input: RotationInput,
  dependencies: RotationDependencies,
): Promise<RotationResult> {
  const current = await dependencies.getEnvironment();
  if (!current.blobCid) {
    throw new Error(
      `Environment "${input.envName}" has not been pushed yet. Run \`fheenv push\` first.`,
    );
  }

  const activeMembers = await dependencies.getActiveMembers();
  const excluded = new Set((input.excludeMembers ?? []).map((member) => member.toLowerCase()));
  const membersToRegrant = activeMembers.filter((member) => !excluded.has(member.toLowerCase()));

  const key = dependencies.generateAesKey();
  const encryptedBlob = dependencies.encryptBlob(input.envContent, key);
  const [keyHigh, keyLow] = dependencies.splitKey(key);
  const newCid = await dependencies.uploadBlob(encryptedBlob);
  const [inKeyHigh, inKeyLow] = await Promise.all([
    dependencies.encryptKeyHalf(keyHigh),
    dependencies.encryptKeyHalf(keyLow),
  ]);

  await dependencies.updateEnvironment({
    inKeyHigh,
    inKeyLow,
    blobCid: newCid,
    expectedVersion: current.version,
  });

  const newVersion = current.version + 1n;
  try {
    await dependencies.batchGrantAccess(membersToRegrant);
  } catch (cause) {
    throw new PartialRotationError(
      `Environment updated to version ${newVersion}, but member regrant failed.`,
      newCid,
      newVersion,
      `fheenv rotate --env ${input.envName} --regrant-only`,
      cause,
    );
  }

  return {
    previousCid: current.blobCid,
    newCid,
    previousVersion: current.version,
    newVersion,
    membersRegranted: membersToRegrant,
  };
}

export async function regrantCurrentMembers(
  dependencies: Pick<RotationDependencies, "getActiveMembers" | "batchGrantAccess">,
): Promise<Address[]> {
  const members = await dependencies.getActiveMembers();
  await dependencies.batchGrantAccess(members);
  return members;
}
