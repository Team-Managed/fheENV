import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { removeOwner } from "../lib/contracts-node";
import { type Address } from "viem";

export interface TeamRemoveOwnerOptions {
  owner: string;
}

export async function teamRemoveOwnerCommand(opts: TeamRemoveOwnerOptions): Promise<void> {
  const config = readConfig();

  if (!opts.owner.match(/^0x[0-9a-fA-F]{40}$/)) {
    throw new Error(`Invalid Ethereum address: ${opts.owner}`);
  }

  const spinner = ora(`Removing co-owner ${opts.owner}…`).start();
  try {
    const { publicClient, walletClient } = createClients(config.rpcUrl, config.chainId);

    await removeOwner(
      config.registryAddress as Address,
      BigInt(config.projectId),
      opts.owner as Address,
      walletClient,
      publicClient,
    );

    spinner.succeed(
      chalk.green(`Co-owner removed: ${opts.owner} can no longer manage this project`),
    );
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
