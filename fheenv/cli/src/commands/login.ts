import * as readline from "readline";
import { Writable } from "stream";
import { saveWallet } from "../lib/wallet";
import chalk from "chalk";
import { createInterface } from "readline";

async function promptPassphrase(label: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(label, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

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
function promptSecret(prompt: string): Promise<string> {
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

export async function loginCommand(opts: { key?: string }): Promise<void> {
  let key: string | undefined;

  if (process.env.FHEENV_PRIVATE_KEY) {
    // CI-preferred path — never echoed, not in shell history
    key = process.env.FHEENV_PRIVATE_KEY;
    console.log(chalk.dim("Using FHEENV_PRIVATE_KEY from environment."));
  } else if (opts.key) {
    // Deprecated: key appears in `ps aux` output and shell history
    key = opts.key;
    console.warn(
      chalk.yellow(
        "\u26a0  --key is deprecated: the private key is visible in shell history\n" +
          "   and process listings. Use a secure alternative instead:\n" +
          "     \u2022 Pipe:     echo $PRIVATE_KEY | fheenv login\n" +
          "     \u2022 CI/CD:    export FHEENV_PRIVATE_KEY=0x...\n" +
          "     \u2022 Prompt:   fheenv login  (hides input)\n",
      ),
    );
  } else if (!process.stdin.isTTY) {
    // Piped: echo $KEY | fheenv login
    key = await readStdin();
  } else {
    // Interactive: prompt with no echo
    key = await promptSecret(chalk.cyan("? ") + "Private key (input hidden): ");
  }

  if (!key) throw new Error("No private key provided.");
  if (!key.match(/^0x[0-9a-fA-F]{64}$/)) {
    throw new Error("Invalid private key format. Must be a 0x-prefixed 32-byte hex string.");
  }
  let passphrase: string | undefined;

  // Only prompt for passphrase in interactive terminal sessions
  if (process.stdin.isTTY && process.stderr.isTTY) {
    const p1 = await promptPassphrase(chalk.cyan("Passphrase to encrypt keyfile (blank = skip): "));
    if (p1.trim()) {
      const p2 = await promptPassphrase(chalk.cyan("Confirm passphrase: "));
      if (p1 !== p2) throw new Error("Passphrases do not match.");
      passphrase = p1;
    }
  }

  saveWallet(key, passphrase || undefined);

  if (passphrase) {
    console.log(
      chalk.green("✓ Wallet saved to ~/.fheenv/wallet.json (AES-256-GCM encrypted, mode 0600)"),
    );
    console.log(chalk.dim("  To unlock non-interactively: set FHEENV_KEY_PASSPHRASE env var."));
  } else {
    console.log(chalk.yellow("✓ Wallet saved to ~/.fheenv/wallet.json (mode 0600, unencrypted)"));
    console.log(
      chalk.dim("  Tip: re-run `fheenv login` with a passphrase to encrypt at rest (SOC 2 CC6.1)."),
    );
  }
}
