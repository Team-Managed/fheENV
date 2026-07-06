import chalk from "chalk";
import ora from "ora";
import { readConfig, writeConfig, type FheEnvConfig } from "../lib/config";
import { createClients, loadAccountKey } from "../lib/wallet";
import { createProject } from "../lib/contracts-node";
import { type Address } from "viem";
import fs from "fs";
import path from "path";

export interface InitOptions {
  name: string;
  registry: string;
  rpcUrl: string;
  chainId: number;
  pinataJwt: string;
  envName?: string;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const configPath = path.resolve(process.cwd(), ".fheenv.json");
  if (fs.existsSync(configPath)) {
    throw new Error(".fheenv.json already exists. Remove it to re-initialize.");
  }

  // Validate wallet is loaded
  loadAccountKey();

  if (!opts.pinataJwt) {
    throw new Error(
      "Pinata JWT is required.\n" +
        "  Set FHEENV_PINATA_JWT env var or pass --pinata-jwt <jwt>\n" +
        "  Get a free JWT at https://app.pinata.cloud/developers/api-keys",
    );
  }

  const spinner = ora(`Creating project "${opts.name}" on-chain...`).start();
  try {
    const { publicClient, walletClient } = createClients(opts.rpcUrl, opts.chainId);

    const projectId = await createProject(
      opts.registry as Address,
      opts.name,
      walletClient,
      publicClient,
    );

    const config: FheEnvConfig = {
      projectId: Number(projectId),
      registryAddress: opts.registry,
      rpcUrl: opts.rpcUrl,
      chainId: opts.chainId,
      pinataJwt: opts.pinataJwt,
    };
    writeConfig(config);

    spinner.succeed(chalk.green(`Project created! ID: ${projectId}`));
    console.log(chalk.cyan("  .fheenv.json written to current directory."));
    if (opts.envName) {
      console.log(chalk.dim(`  Next: fheenv push --env ${opts.envName}`));
    } else {
      console.log(chalk.dim("  Next: fheenv push"));
    }
  } catch (err) {
    spinner.fail("Failed to create project");
    throw err;
  }
}
