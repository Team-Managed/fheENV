import chalk from "chalk";
import ora from "ora";
import { writeProjectConfig } from "../lib/config";
import { createCommandContext, withCommandContext } from "../lib/command-context";
import { type SignerConfig, validateConfigV2 } from "../lib/config-v2";
import { type SecurityMode } from "../lib/credential-types";
import { createProject } from "../lib/contracts-node";
import { type Address } from "viem";
import fs from "fs";
import path from "path";
import { captureAnalytics, enableAnalytics } from "../lib/analytics";

export interface InitOptions {
  name: string;
  registry: string;
  rpcUrl: string;
  chainId: number;
  storageCredential: string;
  signer: SignerConfig;
  securityMode: SecurityMode;
  envName?: string;
  analytics?: boolean;
}

export function pinInteractiveSignerAddress(signer: SignerConfig, address: Address): SignerConfig {
  return signer.type === "walletconnect" || signer.type === "ledger"
    ? { ...signer, expectedAddress: address }
    : signer;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const configPath = path.resolve(process.cwd(), ".fheenv.json");
  if (fs.existsSync(configPath)) {
    throw new Error(".fheenv.json already exists. Remove it to re-initialize.");
  }
  if (opts.analytics) enableAnalytics();

  const provisionalConfig = validateConfigV2({
    version: 2,
    projectId: 0,
    registryAddress: opts.registry,
    rpc: { url: opts.rpcUrl },
    chainId: opts.chainId,
    securityMode: opts.securityMode,
    signer: opts.signer,
    storage: {
      provider: "pinata",
      credentialRef: opts.storageCredential,
    },
  });

  const spinner = ora(`Creating project "${opts.name}" on-chain...`).start();
  try {
    await withCommandContext(
      () => createCommandContext(provisionalConfig),
      async (context) => {
        await context.credentials.storage();
        const projectId = await createProject(
          opts.registry as Address,
          opts.name,
          context.signer.walletClient,
          context.publicClient,
        );
        const deployedAtBlock = await context.publicClient.getBlockNumber();
        const signer = pinInteractiveSignerAddress(
          provisionalConfig.signer,
          context.signer.address,
        );

        writeProjectConfig({
          ...provisionalConfig,
          signer,
          projectId: Number(projectId),
          deployedAtBlock: Number(deployedAtBlock),
        });

        spinner.succeed(chalk.green(`Project created! ID: ${projectId}`));
        await captureAnalytics("cli_initialized", { success: true });
        await captureAnalytics("project_created", { success: true });
        console.log(chalk.cyan("  .fheenv.json written to current directory."));
        if (opts.envName) {
          console.log(chalk.dim(`  Next: fheenv push --env ${opts.envName}`));
        } else {
          console.log(chalk.dim("  Next: fheenv push"));
        }
      },
    );
  } catch (err) {
    spinner.fail("Failed to create project");
    throw err;
  }
}
