import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients, createLitClients, isLitSigningConfigured } from "../lib/wallet";
import { getEnvironment } from "../lib/contracts-node";
import {
  decryptEnvironmentContent,
  rotateEnvironment,
  unpinFromIPFSNode,
  logAuditEvent,
} from "@fheenv/core";
import { capturePosthogEvent } from "../lib/posthog";
import { type Address } from "viem";

/**
 * Check each environment in `.fheenv.json`'s `rotationPolicy` and rotate
 * any that are overdue. Intended for the GitHub Actions scheduled workflow
 * (Phase 4) — exits with code 1 if any rotation fails so Actions marks the
 * run as failed and triggers failure notifications.
 *
 * Rotation is considered due when:
 *   now - updatedAt  >  (expireInDays * 86400) - (graceMinutes * 60)
 *
 * i.e. we start attempting `graceMinutes` before the hard expiry deadline —
 * following the Agoda pattern of treating `expireInDays` as a deadline, not
 * a trigger point, so a failed first attempt has runway to retry.
 */
export async function rotateCheckCommand(): Promise<void> {
  const config = readConfig();

  if (!config.rotationPolicy || Object.keys(config.rotationPolicy).length === 0) {
    console.log(
      chalk.yellow(
        'No rotationPolicy defined in .fheenv.json. Add a "rotationPolicy" block to enable scheduled rotation.\n' +
          "  Example:\n" +
          '    "rotationPolicy": {\n' +
          '      "production": { "expireInDays": 90, "graceMinutes": 15 }\n' +
          "    }",
      ),
    );
    return;
  }

  const clients = isLitSigningConfigured()
    ? await createLitClients(config.rpcUrl, config.chainId)
    : createClients(config.rpcUrl, config.chainId);
  const { publicClient, walletClient, account } = clients;
  const registryAddress = config.registryAddress as Address;
  const projectId = BigInt(config.projectId);
  const nowSecs = Math.floor(Date.now() / 1000);

  let anyFailed = false;

  for (const [envName, policy] of Object.entries(config.rotationPolicy)) {
    const expireInDays = policy.expireInDays ?? 90;
    const graceMinutes = policy.graceMinutes ?? 15;
    // Start attempting graceMinutes before the hard expiry deadline
    const dueSecs = expireInDays * 86400 - graceMinutes * 60;

    const checkSpinner = ora(`Checking rotation policy for env "${envName}"...`).start();
    let updatedAt: bigint;
    let version: bigint;
    try {
      const envData = await getEnvironment(registryAddress, projectId, envName, publicClient);
      updatedAt = envData.updatedAt;
      version = envData.version;
    } catch (err) {
      checkSpinner.fail(
        chalk.red(`Failed to read env "${envName}" from chain: ${(err as Error).message}`),
      );
      anyFailed = true;
      continue;
    }

    const ageSecs = nowSecs - Number(updatedAt);
    const daysOld = (ageSecs / 86400).toFixed(1);

    if (ageSecs < dueSecs) {
      const daysUntilDue = ((dueSecs - ageSecs) / 86400).toFixed(1);
      checkSpinner.succeed(
        chalk.dim(`"${envName}" v${version}: ${daysOld}d old — next rotation in ~${daysUntilDue}d`),
      );
      continue;
    }

    checkSpinner.text = `"${envName}" is ${daysOld}d old (due after ${expireInDays - graceMinutes / 1440}d) — rotating…`;

    // Decrypt current content, then rotate
    let envContent: string;
    let previousCid: string;
    try {
      const decrypted = await decryptEnvironmentContent({
        registryAddress,
        projectId,
        envName,
        chainId: config.chainId,
        publicClient,
        walletClient,
      });
      envContent = decrypted.envContent;
      previousCid = decrypted.blobCid;
    } catch (err) {
      checkSpinner.fail(
        chalk.red(`Failed to decrypt env "${envName}" for rotation: ${(err as Error).message}`),
      );
      anyFailed = true;
      continue;
    }

    try {
      const result = await rotateEnvironment({
        registryAddress,
        projectId,
        envName,
        envContent,
        pinataJwt: config.pinataJwt,
        chainId: config.chainId,
        publicClient,
        walletClient,
      });

      checkSpinner.succeed(
        chalk.green(`"${envName}" rotated (v${result.newVersion}) — ${daysOld}d → fresh`),
      );
      console.log(chalk.dim(`  New CID  : ${result.newCid}`));
      console.log(chalk.dim(`  Prev CID : ${result.previousCid}`));

      // Unpin previous blob after graceMinutes
      let unpinStatus: "success" | "failed" = "success";
      try {
        if (graceMinutes > 0) {
          await new Promise((r) => setTimeout(r, graceMinutes * 60 * 1000));
        }
        await unpinFromIPFSNode(result.previousCid, config.pinataJwt);
        console.log(chalk.dim(`  Unpinned : ${result.previousCid}`));
      } catch {
        unpinStatus = "failed";
        console.warn(chalk.yellow(`  Unpin failed for ${result.previousCid} — logged for retry`));
      }

      const successPayload = {
        actor: account.address,
        action: "key_rotated" as const,
        projectId: String(config.projectId),
        envName,
        triggerSource: "scheduled" as const,
        previousCid: result.previousCid,
        newCid: result.newCid,
        unpinStatus,
      };
      logAuditEvent(successPayload);
      capturePosthogEvent(successPayload);
    } catch (err) {
      checkSpinner.fail(
        chalk.red(`Rotation FAILED for env "${envName}": ${(err as Error).message}`),
      );
      const failPayload = {
        actor: account.address,
        action: "key_rotated" as const,
        projectId: String(config.projectId),
        envName,
        triggerSource: "scheduled" as const,
        previousCid,
        unpinStatus: "failed" as const,
      };
      logAuditEvent(failPayload);
      capturePosthogEvent(failPayload);
      anyFailed = true;
    }
  }

  if (anyFailed) {
    console.error(chalk.bgRed.white.bold(" ⚠️  ONE OR MORE ROTATIONS FAILED — see output above "));
    process.exit(1);
  }
}
