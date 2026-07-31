import chalk from "chalk";
import ora from "ora";
import { readProjectConfig } from "../lib/config";
import { createCommandContext, withCommandContext } from "../lib/command-context";
import { grantAccess } from "../lib/contracts-node";
import { type Address } from "viem";
import { captureAnalytics } from "../lib/analytics";

export interface TeamAddOptions {
  envName?: string;
  member: string;
}

export async function teamAddCommand(opts: TeamAddOptions): Promise<void> {
  const config = readProjectConfig();
  const envName = opts.envName ?? "production";

  if (!opts.member.match(/^0x[0-9a-fA-F]{40}$/)) {
    throw new Error(`Invalid Ethereum address: ${opts.member}`);
  }

  const spinner = ora(`Granting access to ${opts.member}...`).start();
  try {
    await withCommandContext(
      () => createCommandContext(config),
      async (context) => {
        const { publicClient } = context;
        const walletClient = context.signer.walletClient;

        await grantAccess(
          config.registryAddress as Address,
          BigInt(config.projectId),
          envName,
          opts.member as Address,
          walletClient,
          publicClient,
        );

        spinner.succeed(
          chalk.green(`Access granted: ${opts.member} can now pull env "${envName}"`),
        );
        await captureAnalytics("member_added", { success: true });
        console.log(
          chalk.dim(
            `  They will need your CID to fetch the blob, and their address must have FHE decryption access.`,
          ),
        );
      },
    );
  } catch (err) {
    spinner.fail("Grant access failed");
    throw err;
  }
}
