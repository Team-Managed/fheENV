import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import {
  readConfig,
  removeMemberFromCache,
  getCachedMembers,
  ensureDeployedAtBlock,
} from "../lib/config";
import { createClients } from "../lib/wallet";
import { revokeAccess } from "../lib/contracts-node";
import { rotateEnvironment, unpinFromIPFSNode, logAuditEvent } from "@fheenv/core";
import { capturePosthogEvent } from "../lib/posthog";
import { type Address } from "viem";

export interface TeamRemoveOptions {
  envName?: string;
  envFile?: string;
  member: string;
  /** Skip auto-rotation. Use only when batch-removing multiple members
   *  and rotating once at the end. Prints a prominent warning. */
  noRotate?: boolean;
}

export async function teamRemoveCommand(opts: TeamRemoveOptions): Promise<void> {
  const config = readConfig();
  const envName = (opts.envName ?? "production").toLowerCase();
  const envFile = opts.envFile ?? ".env";

  if (!opts.member.match(/^0x[0-9a-fA-F]{40}$/)) {
    throw new Error(`Invalid Ethereum address: ${opts.member}`);
  }
  const memberAddress = opts.member as Address;

  const { publicClient, walletClient, account } = createClients(config.rpcUrl, config.chainId);
  const registryAddress = config.registryAddress as Address;
  const projectId = BigInt(config.projectId);

  // ── Step 1: Logistic revocation ──────────────────────────────────────────
  const revokeSpinner = ora(`Revoking access for ${memberAddress}...`).start();
  try {
    await revokeAccess(
      registryAddress,
      projectId,
      envName,
      memberAddress,
      walletClient,
      publicClient,
    );
    revokeSpinner.succeed(
      chalk.yellow(`Access revoked for ${memberAddress} from env "${envName}"`),
    );
    removeMemberFromCache(envName, memberAddress);
    logAuditEvent({
      actor: account.address,
      action: "member_revoked",
      projectId: String(config.projectId),
      envName,
      target: memberAddress,
    });
  } catch (err) {
    revokeSpinner.fail("Revoke access failed");
    throw err;
  }

  // ── --no-rotate escape hatch ─────────────────────────────────────────────
  if (opts.noRotate) {
    console.log();
    console.log(chalk.bgRed.white.bold(" ⚠️  CRITICAL: AUTO-ROTATION SKIPPED (--no-rotate) "));
    console.log(
      chalk.red(
        `${memberAddress} is logistically removed but RETAINS FHE DECRYPT ACCESS\n` +
          `on the current ciphertext handles until you rotate.\n\n` +
          `Run this before your session ends:\n` +
          `  fheenv rotate --env ${envName}\n`,
      ),
    );
    return;
  }

  // ── Step 2: Read local .env for re-encryption ────────────────────────────
  const envFilePath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envFilePath)) {
    console.log();
    console.log(chalk.bgRed.white.bold(" ⚠️  PARTIAL FAILURE — ROTATION REQUIRED "));
    console.log(
      chalk.red(
        `Cannot auto-rotate: env file not found at ${envFilePath}\n` +
          `${memberAddress} is logistically removed but RETAINS FHE DECRYPT ACCESS.\n\n` +
          `Complete rotation manually:\n` +
          `  fheenv rotate --env ${envName} --file <path-to-env-file>\n`,
      ),
    );
    return;
  }
  const envContent = fs.readFileSync(envFilePath, "utf-8");

  // ── Step 3: Cryptographic revocation via key rotation ────────────────────
  const rotateSpinner = ora(
    `Auto-rotating AES key to cryptographically lock out ${memberAddress}...`,
  ).start();

  let rotateResult: Awaited<ReturnType<typeof rotateEnvironment>>;
  try {
    const fromBlock = await ensureDeployedAtBlock(() => publicClient.getBlockNumber());
    rotateResult = await rotateEnvironment({
      registryAddress,
      projectId,
      envName,
      envContent,
      pinataJwt: config.pinataJwt,
      chainId: config.chainId,
      publicClient,
      walletClient,
      excludeMembers: [memberAddress],
      fromBlock,
      knownMembers: (() => {
        const cached = getCachedMembers(envName);
        return cached ? (cached as Address[]) : undefined;
      })(),
    });
  } catch (err) {
    rotateSpinner.fail(chalk.red("Auto-rotation FAILED after revokeAccess"));
    // Partial failure — revokeAccess succeeded but rotation did not.
    // The member is logistically removed but still holds FHE decrypt access
    // on the current handles. Surface this loudly — this is the CC6.3 gap.
    console.log();
    console.log(chalk.bgRed.white.bold(" ⚠️  PARTIAL FAILURE — IMMEDIATE ACTION REQUIRED "));
    console.log(
      chalk.red(
        `revokeAccess() succeeded — ${memberAddress} is logistically removed.\n` +
          `Rotation FAILED — ${memberAddress} STILL HAS FHE DECRYPT ACCESS on the current handles.\n\n` +
          `To complete cryptographic revocation (do this now):\n` +
          `  fheenv rotate --env ${envName}\n\n` +
          `CC6.3 compliance requires this rotation to complete. Do not skip it.\n`,
      ),
    );
    logAuditEvent({
      actor: account.address,
      action: "key_rotated",
      projectId: String(config.projectId),
      envName,
      triggerSource: "team_remove",
      removedMember: memberAddress,
      unpinStatus: "failed",
    });
    const rotateErr = Object.assign(
      new Error(
        `Partial failure: revokeAccess succeeded but rotation failed for env "${envName}". ` +
          `Run \`fheenv rotate --env ${envName}\` to complete. Underlying error: ${(err as Error).message}`,
      ),
      { cause: err },
    );
    throw rotateErr;
  }

  rotateSpinner.succeed(
    chalk.green(
      `Rotation complete (v${rotateResult.newVersion}) — ${memberAddress} cryptographically locked out`,
    ),
  );
  console.log(chalk.dim(`  New IPFS CID  : ${rotateResult.newCid}`));
  console.log(chalk.dim(`  Previous CID  : ${rotateResult.previousCid}`));
  console.log(
    chalk.dim(
      `  Re-granted    : ${rotateResult.membersRegranted.length > 0 ? rotateResult.membersRegranted.join(", ") : "none"}`,
    ),
  );

  // ── Step 4: Unpin previous IPFS blob ────────────────────────────────────
  // For team-remove triggered rotation the spec says to keep the grace window
  // "as short as your infra reliably allows." The transaction confirmations above
  // already take ~30s+, so any concurrent fheenv pull with the old CID has had
  // time to complete. We attempt the unpin immediately.
  const unpinSpinner = ora(`Unpinning superseded blob ${rotateResult.previousCid}...`).start();
  let unpinStatus: "success" | "failed" = "success";
  try {
    await unpinFromIPFSNode(rotateResult.previousCid, config.pinataJwt);
    unpinSpinner.succeed(chalk.dim(`Previous blob unpinned: ${rotateResult.previousCid}`));
  } catch {
    unpinStatus = "failed";
    unpinSpinner.warn(
      chalk.yellow(
        `Unpin failed for ${rotateResult.previousCid} — logged for retry.\n` +
          `  The blob may still be reachable on IPFS until manually unpinned.`,
      ),
    );
  }

  // ── Audit record ──────────────────────────────────────────────────────────
  // One record capturing the full team-remove rotation event for CC6.3 / CC7.2.
  const auditPayload = {
    actor: account.address,
    action: "key_rotated" as const,
    projectId: String(config.projectId),
    envName,
    triggerSource: "team_remove" as const,
    removedMember: memberAddress,
    previousCid: rotateResult.previousCid,
    newCid: rotateResult.newCid,
    unpinStatus,
  };
  logAuditEvent(auditPayload);
  capturePosthogEvent(auditPayload);
}
