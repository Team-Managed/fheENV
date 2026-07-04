import fs from "fs";
import path from "path";

const CONFIG_FILE = ".fheenv.json";

export interface FheEnvConfig {
  projectId: number;
  registryAddress: string;
  rpcUrl: string;
  chainId: number;
  pinataJwt: string;
}

export function readConfig(): FheEnvConfig {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(`No ${CONFIG_FILE} found. Run \`fheenv init\` first.`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export function writeConfig(config: FheEnvConfig): void {
  fs.writeFileSync(
    path.resolve(process.cwd(), CONFIG_FILE),
    JSON.stringify(config, null, 2),
  );
}
