import chalk from "chalk";
import ora from "ora";
import { type Address } from "viem";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { revokeAccess } from "../lib/contracts-node";
import { rotateCommand } from "./rotate";
import { appendAuditEvent } from "../lib/audit";
import { captureAnalytics } from "../lib/analytics";
import { errorWithCause } from "../lib/errors";
import { PartialRotationError } from "../lib/rotation";

export interface TeamRemoveOptions {
  envName?: string;
  envFile?: string;
  member: string;
  noRotate?: boolean;
}

export interface TeamRemoveDependencies {
  revoke(): Promise<void>;
  rotate(options: {
    envName: string;
    envFile: string;
    excludeMembers: Address[];
  }): Promise<unknown>;
}

export interface TeamRemoveResult {
  rotationSkipped: boolean;
}

export async function removeMemberAndRotate(
  opts: TeamRemoveOptions,
  dependencies: TeamRemoveDependencies,
): Promise<TeamRemoveResult> {
  if (!opts.member.match(/^0x[0-9a-fA-F]{40}$/)) {
    throw new Error(`Invalid Ethereum address: ${opts.member}`);
  }

  await dependencies.revoke();
  if (opts.noRotate) return { rotationSkipped: true };

  try {
    await dependencies.rotate({
      envName: (opts.envName ?? "production").toLowerCase(),
      envFile: opts.envFile ?? ".env",
      excludeMembers: [opts.member as Address],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const recoveryCommand =
      error instanceof PartialRotationError
        ? error.recoveryCommand
        : `fheenv rotate --env ${(opts.envName ?? "production").toLowerCase()} --file ${
            opts.envFile ?? ".env"
          }`;
    throw errorWithCause(
      `Member revoked but rotation failed: ${message}\nRecovery: ${recoveryCommand}`,
      error,
    );
  }

  return { rotationSkipped: false };
}

export async function teamRemoveCommand(opts: TeamRemoveOptions): Promise<void> {
  const config = readConfig();
  const envName = (opts.envName ?? "production").toLowerCase();
  const spinner = ora(`Revoking access for ${opts.member}...`).start();
  let revoked = false;
  let memberAuditAttempted = false;

  try {
    const { publicClient, walletClient } = createClients(config.rpcUrl, config.chainId);
    const result = await removeMemberAndRotate(opts, {
      revoke: async () => {
        await revokeAccess(
          config.registryAddress as Address,
          BigInt(config.projectId),
          envName,
          opts.member as Address,
          walletClient,
          publicClient,
        );
        revoked = true;
        spinner.succeed(chalk.yellow(`Access revoked for ${opts.member} from env "${envName}"`));
      },
      rotate: (options) => rotateCommand({ ...options, trigger: "team_remove" }),
    });

    memberAuditAttempted = true;
    appendAuditEvent({
      action: "member_revoked",
      projectId: String(config.projectId),
      environment: envName,
      target: opts.member,
      status: "success",
      trigger: "team_remove",
    });
    await captureAnalytics("member_removed", { success: true });

    if (result.rotationSkipped) {
      appendAuditEvent({
        action: "rotation_skipped",
        projectId: String(config.projectId),
        environment: envName,
        target: opts.member,
        status: "skipped",
        trigger: "team_remove",
      });
      console.warn(
        chalk.bgYellow.black.bold(
          " Rotation skipped explicitly: the removed member retains access to current ciphertext handles. ",
        ),
      );
      console.warn(
        chalk.yellow(`Run: fheenv rotate --env ${envName} --file ${opts.envFile ?? ".env"}`),
      );
      return;
    }

    console.log(
      chalk.green(
        `✓ Member removal complete: ${opts.member} was revoked and "${envName}" was rotated.`,
      ),
    );
  } catch (error) {
    if (spinner.isSpinning) spinner.fail("Member removal failed");
    if (revoked && !memberAuditAttempted) {
      try {
        appendAuditEvent({
          action: "member_revoked",
          projectId: String(config.projectId),
          environment: envName,
          target: opts.member,
          status: "success",
          trigger: "team_remove",
        });
      } catch (auditError) {
        const operationMessage = error instanceof Error ? error.message : String(error);
        const auditMessage = auditError instanceof Error ? auditError.message : String(auditError);
        throw errorWithCause(`${operationMessage}\n${auditMessage}`, error);
      }
    }
    throw error;
  }
}
