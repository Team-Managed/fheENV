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
