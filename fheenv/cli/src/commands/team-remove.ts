import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { revokeAccess } from "../lib/contracts-node";
import { type Address } from "viem";

export interface TeamRemoveOptions {
  envName?: string;
  member: string;
}

export async function teamRemoveCommand(
  opts: TeamRemoveOptions,
): Promise<void> {
  const config = readConfig();
  const envName = opts.envName ?? "production";

  if (!opts.member.match(/^0x[0-9a-fA-F]{40}$/)) {
    throw new Error(`Invalid Ethereum address: ${opts.member}`);
  }

  // ⚠️  ROTATION REQUIRED — prominently warn the user
  console.log();
  console.log(
    chalk.bgRed.white.bold(" ⚠️  SECURITY NOTICE: KEY ROTATION REQUIRED "),
  );
  console.log(
    chalk.red(
      "Revoking access only prevents future FHE decryptions.\n" +
        "The removed member may retain previously decrypted plaintext.\n\n" +
        "YOU MUST rotate the environment after revoking access:\n" +
        "  1. Run `fheenv push` to re-encrypt with a NEW AES key\n" +
        "  2. This generates fresh FHE ciphertexts the removed member cannot decrypt\n" +
        "  3. Only then is your secret material truly inaccessible to them\n",
    ),
  );
  console.log();

  const spinner = ora(`Revoking access for ${opts.member}...`).start();
  try {
    const { publicClient, walletClient } = createClients(
      config.rpcUrl,
      config.chainId,
    );

    await revokeAccess(
      config.registryAddress as Address,
      BigInt(config.projectId),
      envName,
      opts.member as Address,
      walletClient,
      publicClient,
    );

    spinner.succeed(
      chalk.yellow(`Access revoked for ${opts.member} from env "${envName}"`),
    );
    console.log(
      chalk.bgYellow.black.bold(
        " → ACTION REQUIRED: Run `fheenv push` NOW to rotate the AES key. ",
      ),
    );
  } catch (err) {
    spinner.fail("Revoke access failed");
    throw err;
  }
}
