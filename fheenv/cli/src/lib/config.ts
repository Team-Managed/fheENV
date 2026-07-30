import fs from "fs";
import path from "path";

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

export function requireDeployedAtBlock(config: FheEnvConfig): bigint {
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
