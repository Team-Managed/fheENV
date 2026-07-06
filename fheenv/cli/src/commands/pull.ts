import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { aesDecryptNode, joinUint128ToAesKeyNode } from "../lib/aes-node";
import { fetchFromIPFSNode } from "../lib/ipfs-node";
import { getEnvironment } from "../lib/contracts-node";
import { createFheClient, fheDecryptUint128 } from "../lib/fhe-node";
import { type Address } from "viem";

export interface PullOptions {
  envName?: string;
  output?: string;
}

export async function pullCommand(opts: PullOptions = {}): Promise<void> {
  const config = readConfig();
  const envName = opts.envName ?? "production";
  const outFile = opts.output ?? ".env.local";

  const spinner = ora(`Pulling env "${envName}"...`).start();
  try {
    const { publicClient, walletClient } = createClients(config.rpcUrl, config.chainId);
    const registryAddress = config.registryAddress as Address;
    const projectId = BigInt(config.projectId);

    // 1. Get ciphertext handles + blob CID from chain
    spinner.text = "Reading environment from chain...";
    const envData = await getEnvironment(registryAddress, projectId, envName, publicClient);

    if (!envData.blobCid) {
      throw new Error(`Environment "${envName}" has not been pushed yet.`);
    }

    // 2. Connect FHE client and decrypt key halves via threshold network
    spinner.text = "Decrypting AES key via threshold network (requires permit)...";
    const fheClient = await createFheClient(config.chainId, publicClient, walletClient);

    const keyHigh = await fheDecryptUint128(
      fheClient,
      envData.aesKeyHigh,
      config.chainId,
      publicClient,
      walletClient,
    );
    const keyLow = await fheDecryptUint128(
      fheClient,
      envData.aesKeyLow,
      config.chainId,
      publicClient,
      walletClient,
    );

    // 3. Reconstruct AES key
    const aesKey = joinUint128ToAesKeyNode(keyHigh, keyLow);

    // 4. Fetch encrypted blob from IPFS and decrypt
    spinner.text = "Fetching and decrypting env blob from IPFS...";
    const encryptedBlob = await fetchFromIPFSNode(envData.blobCid);
    const envContent = aesDecryptNode(encryptedBlob, aesKey);

    // 5. Write to output file
    const outPath = path.resolve(process.cwd(), outFile);
    fs.writeFileSync(outPath, envContent, { mode: 0o600 });

    spinner.succeed(chalk.green(`Decrypted env written to ${outFile} (permissions: 0600)`));
    console.log(
      chalk.dim(
        `  Version: ${envData.version} | Updated: ${new Date(
          Number(envData.updatedAt) * 1000,
        ).toISOString()}`,
      ),
    );
  } catch (err) {
    spinner.fail("Pull failed");
    throw err;
  }
}
