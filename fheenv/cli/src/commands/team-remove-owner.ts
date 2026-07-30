import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { removeOwner } from "../lib/contracts-node";
import { getAddress, isAddress, type Address } from "viem";

export interface TeamRemoveOwnerOptions {
  owner: string;
}

export async function teamRemoveOwnerCommand(opts: TeamRemoveOwnerOptions): Promise<void> {
  const config = readConfig();

  if (!isAddress(opts.owner)) {
    throw new Error(`Invalid Ethereum address: ${opts.owner}`);
  }
  const owner = getAddress(opts.owner);

  const spinner = ora(`Removing co-owner ${owner}...`).start();
  try {
    const { publicClient, walletClient } = createClients(config.rpcUrl, config.chainId);

    await removeOwner(
      config.registryAddress as Address,
      BigInt(config.projectId),
      owner as Address,
      walletClient,
      publicClient,
    );

    spinner.succeed(chalk.green(`Co-owner removed: ${owner} can no longer manage this project`));
    console.log(
      chalk.dim(
        "  They retain any env-level decrypt access previously granted.\n" +
          "  Run `fheenv team remove -m <address>` and then rotate to fully revoke.",
      ),
    );
  } catch (err) {
    spinner.fail("Remove co-owner failed");
    throw err;
  }
}
