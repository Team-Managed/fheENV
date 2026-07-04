import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { generateAesKeyNode, aesEncryptNode, splitAesKeyToUint128Node } from "../lib/aes-node";
import { uploadToIPFSNode } from "../lib/ipfs-node";
import { getEnvironment, updateEnvironment } from "../lib/contracts-node";
import { createFheClient, fheEncryptUint128, toInEuint128 } from "../lib/fhe-node";
import { type Address } from "viem";

export interface PushOptions {
  envFile?: string;
  envName?: string;
}

export async function pushCommand(opts: PushOptions = {}): Promise<void> {
  const config = readConfig();
  const envFile = opts.envFile ?? ".env";
  const envName = opts.envName ?? "production";
  const envFilePath = path.resolve(process.cwd(), envFile);

  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Env file not found: ${envFilePath}`);
  }
  const envContent = fs.readFileSync(envFilePath, "utf-8");

  const spinner = ora("Encrypting secrets...").start();
  try {
    const { publicClient, walletClient, account } = createClients(
      config.rpcUrl,
      config.chainId
    );
    const registryAddress = config.registryAddress as Address;
    const projectId = BigInt(config.projectId);

    // 1. Generate AES key and encrypt blob
    spinner.text = "Generating AES key and encrypting env blob...";
    const aesKey = generateAesKeyNode();
    const encryptedBlob = aesEncryptNode(envContent, aesKey);
    const [keyHigh, keyLow] = splitAesKeyToUint128Node(aesKey);

    // 2. Upload encrypted blob to IPFS
    spinner.text = "Uploading encrypted blob to IPFS...";
    const blobCid = await uploadToIPFSNode(encryptedBlob, envFile, config.pinataJwt);

    // 3. Get current environment version for optimistic concurrency
    spinner.text = "Fetching current environment version...";
    let currentVersion = 0n;
    try {
      const envData = await getEnvironment(registryAddress, projectId, envName, publicClient);
      currentVersion = envData.version;
    } catch {
      // environment doesn't exist yet — version 0
    }

    // 4. FHE-encrypt both AES key halves
    spinner.text = "FHE-encrypting AES key via threshold network...";
    const fheClient = await createFheClient(config.chainId, publicClient, walletClient);

    const encHigh = await fheEncryptUint128(
      fheClient,
      keyHigh,
      account.address,
      config.chainId
    );
    const encLow = await fheEncryptUint128(
      fheClient,
      keyLow,
      account.address,
      config.chainId
    );

    // 5. Write to chain
    spinner.text = "Writing encrypted environment to chain...";
    await updateEnvironment(
      registryAddress,
      {
        projectId,
        envName,
        inKeyHigh: toInEuint128(encHigh),
        inKeyLow: toInEuint128(encLow),
        blobCid,
        expectedVersion: currentVersion,
      },
      walletClient,
      publicClient
    );

    spinner.succeed(chalk.green(`Pushed env "${envName}" to chain (CID: ${blobCid})`));
    console.log(chalk.dim(`  Project: ${config.projectId} | Version: ${currentVersion + 1n}`));
  } catch (err) {
    spinner.fail("Push failed");
    throw err;
  }
}
