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

export interface RotateOptions {
  envName?: string;
  envFile?: string;
  regrantOnly?: boolean;
  excludeMembers?: Address[];
}

export async function rotateCommand(opts: RotateOptions = {}): Promise<RotationResult | void> {
  const config = readConfig();
  const envName = (opts.envName ?? "production").toLowerCase();
  const spinner = ora(`Rotating AES key for env "${envName}"...`).start();

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
      batchGrantAccess(
        registryAddress,
        projectId,
        envName,
        members,
        walletClient,
        publicClient,
      );

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
        getEnvironment: () =>
          getEnvironment(registryAddress, projectId, envName, publicClient),
        getActiveMembers: getMembers,
        generateAesKey: generateAesKeyNode,
        encryptBlob: aesEncryptNode,
        splitKey: splitAesKeyToUint128Node,
        uploadBlob: (blob) => uploadToIPFSNode(blob, envName, config.pinataJwt),
        encryptKeyHalf: async (value) =>
          toInEuint128(
            await fheEncryptUint128(fheClient, value, account.address, config.chainId),
          ),
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

    spinner.succeed(chalk.green(`Rotation complete for "${envName}" (v${result.newVersion})`));
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
    spinner.fail("Rotation failed");
    if (error instanceof PartialRotationError) {
      console.error(chalk.red(`  Recovery required: ${error.recoveryCommand}`));
    }
    throw error;
  }
}
