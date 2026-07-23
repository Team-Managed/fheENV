import chalk from "chalk";
import ora from "ora";
import { readConfig, addMemberToCache } from "../lib/config";
import { createClients } from "../lib/wallet";
import { grantAccess, grantAccessWithExpiry } from "../lib/contracts-node";
import { logAuditEvent } from "../lib/audit";
import { type Address } from "viem";

export interface TeamAddOptions {
  envName?: string;
  member: string;
  /** SOC 2 CC6.3: duration string for time-limited CI grants, e.g. "30d", "8h", "90d" */
  expires?: string;
}

/** Parse a duration string like "30d", "8h", "90m" into a Unix timestamp (seconds). */
function parseDuration(duration: string): bigint {
  const match = duration.trim().match(/^(\d+)(d|h|m)$/i);
  if (!match) {
    throw new Error(
      `Invalid duration "${duration}". Use format: <number><unit> where unit is d (days), h (hours), or m (minutes). Example: 30d`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const seconds = unit === "d" ? value * 86400 : unit === "h" ? value * 3600 : value * 60;
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}

export async function teamAddCommand(opts: TeamAddOptions): Promise<void> {
  const config = readConfig();
  const envName = opts.envName ?? "production";

  if (!opts.member.match(/^0x[0-9a-fA-F]{40}$/)) {
    throw new Error(`Invalid Ethereum address: ${opts.member}`);
  }

  const expiresAt = opts.expires ? parseDuration(opts.expires) : undefined;

  const spinner = ora(`Granting access to ${opts.member}...`).start();
  try {
    const { publicClient, walletClient, account } = createClients(config.rpcUrl, config.chainId);

    if (expiresAt !== undefined) {
      await grantAccessWithExpiry(
        config.registryAddress as Address,
        BigInt(config.projectId),
        envName,
        opts.member as Address,
        expiresAt,
        walletClient,
        publicClient,
      );
      const expiryDate = new Date(Number(expiresAt) * 1000).toISOString();
      spinner.succeed(
        chalk.green(`Access granted: ${opts.member} can decrypt "${envName}" until ${expiryDate}`),
      );
      console.log(chalk.dim(`  SOC 2 CC6.3: time-limited grant expires ${expiryDate}`));
      logAuditEvent({
        actor: account.address,
        action: "member_granted",
        projectId: config.projectId.toString(),
        envName,
        target: opts.member,
        expiresAt: expiryDate,
      });
    } else {
      await grantAccess(
        config.registryAddress as Address,
        BigInt(config.projectId),
        envName,
        opts.member as Address,
        walletClient,
        publicClient,
      );
      spinner.succeed(chalk.green(`Access granted: ${opts.member} can now pull env "${envName}"`));
      console.log(
        chalk.dim(
          `  They will need your CID to fetch the blob, and their address must have FHE decryption access.`,
        ),
      );
      addMemberToCache(envName, opts.member);
      logAuditEvent({
        actor: account.address,
        action: "member_granted",
        projectId: config.projectId.toString(),
        envName,
        target: opts.member,
      });
    }
  } catch (err) {
    spinner.fail("Grant access failed");
    throw err;
  }
}
