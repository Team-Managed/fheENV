import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import type { Address } from "viem";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { generateAesKeyNode, aesEncryptNode, splitAesKeyToUint128Node } from "../lib/aes-node";
import { uploadToIPFSNode } from "../lib/ipfs-node";
import {
  getEnvironment,
  updateEnvironment,
  batchGrantAccess,
  getActiveMembers,
} from "../lib/contracts-node";
import { createFheClient, fheEncryptUint128, toInEuint128 } from "../lib/fhe-node";
import {
  PartialRotationError,
  regrantCurrentMembers,
  rotateEnvironment,
  type RotationResult,
} from "../lib/rotation";
import { appendAuditEvent, type AuditEvent } from "../lib/audit";
import { captureAnalytics } from "../lib/analytics";

export interface RotateOptions {
  envName?: string;
  envFile?: string;
  regrantOnly?: boolean;
  excludeMembers?: Address[];
  trigger?: AuditEvent["trigger"];
}

export async function rotateCommand(opts: RotateOptions = {}): Promise<RotationResult | void> {
  const config = readConfig();
  const envName = (opts.envName ?? "production").toLowerCase();
  const spinner = ora(`Rotating AES key for env "${envName}"...`).start();
  let completedResult: RotationResult | undefined;

  try {
    const { publicClient, walletClient, account } = createClients(config.rpcUrl, config.chainId);
    const registryAddress = config.registryAddress as Address;
    const projectId = BigInt(config.projectId);
    const getMembers = () =>
      getActiveMembers(
        registryAddress,
        projectId,
        envName,
        publicClient,
        BigInt(config.deployedAtBlock),
      );
    const grantMembers = (members: Address[]) =>
      batchGrantAccess(registryAddress, projectId, envName, members, walletClient, publicClient);

    if (opts.regrantOnly) {
      spinner.text = "Regranting current members on the latest FHE handles...";
      const members = await regrantCurrentMembers({
        getActiveMembers: getMembers,
        batchGrantAccess: grantMembers,
      });
      spinner.succeed(
        chalk.green(
          `Regrant complete for "${envName}" (${members.length} member${members.length === 1 ? "" : "s"})`,
        ),
      );
      return;
    }

    const envFile = opts.envFile ?? ".env";
    const envFilePath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(envFilePath)) {
      throw new Error(
        `Env file not found: ${envFilePath}\n  Tip: provide the file path with --file <path>`,
      );
    }
    const envContent = fs.readFileSync(envFilePath, "utf-8");
    const fheClient = await createFheClient(config.chainId, publicClient, walletClient);

    const result = await rotateEnvironment(
      {
        envName,
        envContent,
        excludeMembers: opts.excludeMembers,
      },
      {
        getEnvironment: () => getEnvironment(registryAddress, projectId, envName, publicClient),
        getActiveMembers: getMembers,
        generateAesKey: generateAesKeyNode,
        encryptBlob: aesEncryptNode,
        splitKey: splitAesKeyToUint128Node,
        uploadBlob: (blob) => uploadToIPFSNode(blob, envName, config.pinataJwt),
        encryptKeyHalf: async (value) =>
          toInEuint128(await fheEncryptUint128(fheClient, value, account.address, config.chainId)),
        updateEnvironment: (params) =>
          updateEnvironment(
            registryAddress,
            {
              projectId,
              envName,
              ...params,
            },
            walletClient,
            publicClient,
          ),
        batchGrantAccess: grantMembers,
      },
    );
    completedResult = result;
    await captureAnalytics("rotation_completed", { success: true });

    spinner.succeed(chalk.green(`Rotation complete for "${envName}" (v${result.newVersion})`));
    appendAuditEvent({
      action: "rotation_completed",
      projectId: String(config.projectId),
      environment: envName,
      previousVersion: String(result.previousVersion),
      newVersion: String(result.newVersion),
      status: "success",
      trigger: opts.trigger ?? "manual",
    });
    console.log(chalk.dim(`  New IPFS CID : ${result.newCid}`));
    console.log(
      chalk.dim(
        `  Members re-granted : ${
          result.membersRegranted.length > 0 ? result.membersRegranted.join(", ") : "none"
        }`,
      ),
    );
    return result;
  } catch (error) {
    if (completedResult) {
      spinner.fail("Rotation completed, but the local audit write failed");
      throw error;
    }
    await captureAnalytics("rotation_failed", { success: false });
    spinner.fail("Rotation failed");
    if (error instanceof PartialRotationError) {
      console.error(chalk.red(`  Recovery required: ${error.recoveryCommand}`));
      try {
        appendAuditEvent({
          action: "rotation_failed",
          projectId: String(config.projectId),
          environment: envName,
          newVersion: String(error.newVersion),
          status: "partial",
          trigger: opts.trigger ?? "manual",
        });
      } catch (auditError) {
        const auditMessage = auditError instanceof Error ? auditError.message : String(auditError);
        throw new Error(`${error.message}\n${auditMessage}`);
      }
    } else {
      try {
        appendAuditEvent({
          action: "rotation_failed",
          projectId: String(config.projectId),
          environment: envName,
          status: "failed",
          trigger: opts.trigger ?? "manual",
        });
      } catch (auditError) {
        const operationMessage = error instanceof Error ? error.message : String(error);
        const auditMessage = auditError instanceof Error ? auditError.message : String(auditError);
        throw new Error(`${operationMessage}\n${auditMessage}`);
      }
    }
    throw error;
  }
}
