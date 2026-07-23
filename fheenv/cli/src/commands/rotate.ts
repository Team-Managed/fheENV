import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { readConfig, getCachedMembers, ensureDeployedAtBlock } from "../lib/config";
import { createClients } from "../lib/wallet";
import { rotateEnvironment, logAuditEvent } from "@fheenv/core";
import { capturePosthogEvent } from "../lib/posthog";
import { type Address } from "viem";

export interface RotateOptions {
  envName?: string;
  envFile?: string;
}

/**
 * CLI wrapper for the core rotation pipeline.
 * Reads the local .env file and delegates all rotation logic to
 * @fheenv/core's rotateEnvironment() — the single source of truth.
 */
export async function rotateCommand(opts: RotateOptions = {}): Promise<void> {
  const config = readConfig();
  const envName = (opts.envName ?? "production").toLowerCase();
  const envFile = opts.envFile ?? ".env";

  const envFilePath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envFilePath)) {
    throw new Error(
      `Env file not found: ${envFilePath}\n` + `  Tip: provide the file path with --file <path>`,
    );
  }
  const envContent = fs.readFileSync(envFilePath, "utf-8");

  const spinner = ora(`Rotating AES key for env "${envName}"...`).start();
  try {
    const { publicClient, walletClient, account } = createClients(config.rpcUrl, config.chainId);

    spinner.text = "Fetching current environment and members from chain...";
    const fromBlock = await ensureDeployedAtBlock(() => publicClient.getBlockNumber());
    const cachedMembers = getCachedMembers(envName);
    const result = await rotateEnvironment({
      registryAddress: config.registryAddress as Address,
      projectId: BigInt(config.projectId),
      envName,
      envContent,
      pinataJwt: config.pinataJwt,
      chainId: config.chainId,
      publicClient,
      walletClient,
      fromBlock,
      knownMembers: cachedMembers ? (cachedMembers as Address[]) : undefined,
    });

    const auditPayload = {
      actor: account.address,
      action: "key_rotated" as const,
      projectId: String(config.projectId),
      envName,
      triggerSource: "manual_cli" as const,
      previousCid: result.previousCid,
      newCid: result.newCid,
      txHash: result.txHash,
      unpinStatus: "pending" as const,
    };
    logAuditEvent(auditPayload);
    capturePosthogEvent(auditPayload);

    spinner.succeed(chalk.green(`Rotation complete for "${envName}" (v${result.newVersion})`));
    console.log(chalk.dim(`  New IPFS CID : ${result.newCid}`));
    console.log(
      chalk.dim(
        `  Members re-granted : ${result.membersRegranted.length > 0 ? result.membersRegranted.join(", ") : "none"}`,
      ),
    );
    console.log(chalk.dim(`  Previous CID : ${result.previousCid} (queued for unpin)`));
    console.log(
      chalk.yellow(
        "\n  Old ciphertext handles are now abandoned. Removed members can no longer decrypt.",
      ),
    );
  } catch (err) {
    spinner.fail("Rotation failed");
    throw err;
  }
}
