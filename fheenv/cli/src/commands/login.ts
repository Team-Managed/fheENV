import * as readline from "readline";
import { Writable } from "stream";
import { saveWallet } from "../lib/wallet";
import chalk from "chalk";
import { createInterface } from "readline";

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
function promptSecret(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    let result = "";

    const onKeypress = (str: string, key: readline.Key) => {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Interrupted"));
        return;
      }
      if (key && (key.name === "return" || key.name === "enter")) {
        cleanup();
        process.stdout.write("\n");
        resolve(result.trim());
        return;
      }
      if (key && key.name === "backspace") {
        if (result.length > 0) {
          result = result.slice(0, -1);
          process.stdout.write("\x1B[1D\x1B[0K");
        }
        return;
      }
      if (str && (!key || (!key.ctrl && !key.meta))) {
        // filter printable characters
        const printable = str.replace(/[^\x20-\x7E]/g, "");
        if (printable.length > 0) {
          result += printable;
          process.stdout.write("*".repeat(printable.length));
        }
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKeypress);
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
    const p1 = await promptSecret(chalk.cyan("Passphrase to encrypt keyfile (blank = skip): "));
    if (p1.trim()) {
      const p2 = await promptSecret(chalk.cyan("Confirm passphrase: "));
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
