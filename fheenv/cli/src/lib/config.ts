import fs from "fs";
import path from "path";
import { FheEnvConfigV2, readConfigV2, validateConfigV2 } from "./config-v2";

const CONFIG_FILE = ".fheenv.json";

export interface FheEnvConfig {
  projectId: number;
  registryAddress: string;
  rpcUrl: string;
  chainId: number;
  pinataJwt: string;
  deployedAtBlock?: number;
}

export function readConfig(): FheEnvConfig {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(`No ${CONFIG_FILE} found. Run \`fheenv init\` first.`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as FheEnvConfig;
}

export function requireDeployedAtBlock(config: { deployedAtBlock?: number }): bigint {
  if (!Number.isInteger(config.deployedAtBlock) || (config.deployedAtBlock ?? -1) < 0) {
    throw new Error(
      "deployedAtBlock is missing or invalid in .fheenv.json. " +
        "Set it to the registry proxy deployment block before replaying access events.",
    );
  }
  return BigInt(config.deployedAtBlock as number);
}

export function writeConfig(config: FheEnvConfig): void {
  fs.writeFileSync(path.resolve(process.cwd(), CONFIG_FILE), JSON.stringify(config, null, 2));
}

export function readProjectConfig(): FheEnvConfigV2 {
  return readConfigV2(path.resolve(process.cwd(), CONFIG_FILE));
}

export function writeProjectConfig(config: FheEnvConfigV2): void {
  const validated = validateConfigV2(config);
  fs.writeFileSync(
    path.resolve(process.cwd(), CONFIG_FILE),
    `${JSON.stringify(validated, null, 2)}\n`,
    { mode: 0o644 },
  );
}
