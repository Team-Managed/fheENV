import * as readline from "readline";
import { Writable } from "stream";
import { migrateLegacyWallet, saveWallet } from "../lib/wallet";
import chalk from "chalk";

/** Read a full line from non-TTY stdin (piped input). */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.resume();
  });
}

/**
 * Prompt for a secret value on a TTY without echoing characters.
 * Uses a muted Writable so keystrokes are never written to stdout.
 */
export function promptSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    const output = new Writable({
      write(chunk: unknown, _enc: BufferEncoding, cb: () => void) {
        if (!muted) process.stdout.write(chunk as Buffer);
        cb();
      },
    });

    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

    process.stdout.write(prompt);
    muted = true;

    const onSigint = () => {
      muted = false;
      process.stdout.write("\n");
      rl.close();
      reject(new Error("Interrupted"));
    };
    process.once("SIGINT", onSigint);

    rl.question("", (answer) => {
      process.removeListener("SIGINT", onSigint);
      muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function readPassphrase(): Promise<string> {
  const environmentPassphrase = process.env.FHEENV_KEY_PASSPHRASE;
  if (environmentPassphrase?.trim()) return environmentPassphrase;
  if (!process.stdin.isTTY) {
    throw new Error(
      "FHEENV_KEY_PASSPHRASE is required for non-interactive encrypted wallet storage.",
    );
  }

  const passphrase = await promptSecret(chalk.cyan("? ") + "Wallet passphrase (input hidden): ");
  if (!passphrase.trim()) throw new Error("Passphrase is required for encrypted wallet storage.");
  const confirmation = await promptSecret(chalk.cyan("? ") + "Confirm passphrase: ");
  if (passphrase !== confirmation) throw new Error("Passphrases do not match.");
  return passphrase;
}

export async function loginCommand(opts: { migrate?: boolean }): Promise<void> {
  if (opts.migrate) {
    migrateLegacyWallet(await readPassphrase());
    console.log(
      chalk.green("✓ Legacy wallet migrated to AES-256-GCM encrypted storage (permissions: 0600)"),
    );
    return;
  }

  let key: string | undefined;

  if (process.env.FHEENV_PRIVATE_KEY) {
    // Backward-compatible development path. Production mode rejects this signer.
    key = process.env.FHEENV_PRIVATE_KEY;
    console.warn(
      chalk.yellow(
        "\u26a0  FHEENV_PRIVATE_KEY is supported only for development migration.\n" +
          "   Production projects must use WalletConnect, Ledger, AWS KMS, or an external signer.\n",
      ),
    );
  } else if (!process.stdin.isTTY) {
    // Piped: echo $KEY | fheenv login
    key = await readStdin();
  } else {
    // Interactive: prompt with no echo
    key = await promptSecret(chalk.cyan("? ") + "Private key (input hidden): ");
  }

  if (!key) throw new Error("No development key provided.");
  if (!key.match(/^0x[0-9a-fA-F]{64}$/)) {
    throw new Error("Invalid private key format. Must be a 0x-prefixed 32-byte hex string.");
  }
  saveWallet(key, await readPassphrase());
  console.log(
    chalk.green(
      "\u2713 Wallet saved to ~/.fheenv/wallet.json (AES-256-GCM encrypted, permissions: 0600)",
    ),
  );
  console.log(
    chalk.dim("  Set FHEENV_KEY_PASSPHRASE through your secure local secret source to unlock it."),
  );
}
