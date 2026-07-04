import { spawn } from "child_process";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { aesDecryptNode, joinUint128ToAesKeyNode } from "../lib/aes-node";
import { fetchFromIPFSNode } from "../lib/ipfs-node";
import { getEnvironment } from "../lib/contracts-node";
import { createFheClient, fheDecryptUint128 } from "../lib/fhe-node";
import { parseEnvNode } from "../lib/env-parser-node";
import { type Address } from "viem";

export interface RunOptions {
  envName?: string;
  command: string[];
}

export async function runCommand(opts: RunOptions): Promise<void> {
  if (opts.command.length === 0) {
    throw new Error(
      "No command provided. Usage: fheenv run -- <command> [args...]",
    );
  }

  const config = readConfig();
  const envName = opts.envName ?? "production";

  const spinner = ora(`Fetching env "${envName}" for run...`).start();
  try {
    const { publicClient, walletClient } = createClients(
      config.rpcUrl,
      config.chainId,
    );
    const registryAddress = config.registryAddress as Address;
    const projectId = BigInt(config.projectId);

    spinner.text = "Reading environment from chain...";
    const envData = await getEnvironment(
      registryAddress,
      projectId,
      envName,
      publicClient,
    );

    if (!envData.blobCid) {
      throw new Error(`Environment "${envName}" has not been pushed yet.`);
    }

    spinner.text = "Decrypting AES key via threshold network...";
    const fheClient = await createFheClient(
      config.chainId,
      publicClient,
      walletClient,
    );

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

    const aesKey = joinUint128ToAesKeyNode(keyHigh, keyLow);

    spinner.text = "Fetching and decrypting env blob...";
    const encryptedBlob = await fetchFromIPFSNode(envData.blobCid);
    const envContent = aesDecryptNode(encryptedBlob, aesKey);

    // Parse env vars — NEVER write to disk
    const envVars = parseEnvNode(envContent);

    spinner.stop();

    // Inject vars into child process env
    const childEnv = { ...process.env, ...envVars };
    const [cmd, ...args] = opts.command;

    const child = spawn(cmd, args, {
      env: childEnv,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (err) => {
      process.stderr.write(
        `fheenv run: failed to start process: ${err.message}\n`,
      );
      process.exit(1);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
    });
  } catch (err) {
    spinner.fail("Run setup failed");
    throw err;
  }
}
