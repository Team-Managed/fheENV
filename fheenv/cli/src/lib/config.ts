import fs from "fs";
import path from "path";

const CONFIG_FILE = ".fheenv.json";

export interface RotationPolicyEntry {
  /** Maximum age in days before a rotation is overdue.
   *  The GitHub Actions scheduler checks this per environment on each run. */
  expireInDays?: number;
  /**
   * Minutes to wait after updateEnvironment() confirms before unpinning the
   * previous IPFS blob. Protects in-flight `fheenv pull` calls.
   * Default: 15. For team-remove triggered rotation the CLI ignores this
   * and unpins immediately (the tx confirmation window is already sufficient).
   */
  graceMinutes?: number;
}

export interface FheEnvConfig {
  projectId: number;
  registryAddress: string;
  rpcUrl: string;
  chainId: number;
  pinataJwt: string;
  /** Block number at which the project was created — used as fromBlock for eth_getLogs */
  deployedAtBlock?: number;
  /** Local cache of active members per env — avoids eth_getLogs archive queries */
  members?: Record<string, string[]>;
  /** Per-environment rotation policy — see §4.1 of the key-rotation spec */
  rotationPolicy?: Record<string, RotationPolicyEntry>;
}

export function readConfig(): FheEnvConfig {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(`No ${CONFIG_FILE} found. Run \`fheenv init\` first.`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as FheEnvConfig;
  // CI env vars override .fheenv.json secrets so the file can be committed without secrets.
  // FHEENV_PRIVATE_KEY is handled separately in wallet.ts (loadAccountKey).
  if (process.env.FHEENV_PINATA_JWT) config.pinataJwt = process.env.FHEENV_PINATA_JWT;
  if (process.env.FHEENV_RPC_URL) config.rpcUrl = process.env.FHEENV_RPC_URL;
  return config;
}

export function writeConfig(config: FheEnvConfig): void {
  fs.writeFileSync(path.resolve(process.cwd(), CONFIG_FILE), JSON.stringify(config, null, 2));
}

/** Add a member address to the local cache for an env. */
export function addMemberToCache(envName: string, address: string): void {
  const config = readConfig();
  const members = config.members ?? {};
  const list = members[envName] ?? [];
  const normalized = address.toLowerCase();
  if (!list.map((a) => a.toLowerCase()).includes(normalized)) {
    list.push(address);
  }
  members[envName] = list;
  writeConfig({ ...config, members });
}

/** Remove a member address from the local cache for an env. */
export function removeMemberFromCache(envName: string, address: string): void {
  const config = readConfig();
  const members = config.members ?? {};
  const list = members[envName] ?? [];
  const normalized = address.toLowerCase();
  members[envName] = list.filter((a) => a.toLowerCase() !== normalized);
  writeConfig({ ...config, members });
}

/** Get cached members for an env. Returns null if no cache exists (falls back to chain). */
export function getCachedMembers(envName: string): string[] | null {
  const config = readConfig();
  if (!config.members || !(envName in config.members)) return null;
  return config.members[envName];
}

/**
 * Ensure deployedAtBlock is set in .fheenv.json.
 * If missing, uses currentBlock - 200 as a safe non-archive default and persists it.
 * Call this before any eth_getLogs operation.
 */
export async function ensureDeployedAtBlock(
  getCurrentBlock: () => Promise<bigint>,
): Promise<bigint> {
  const config = readConfig();
  if (config.deployedAtBlock !== undefined) return BigInt(config.deployedAtBlock);
  const current = await getCurrentBlock();
  const safe = current > 200n ? current - 200n : 0n;
  writeConfig({ ...config, deployedAtBlock: Number(safe) });
  return safe;
}
