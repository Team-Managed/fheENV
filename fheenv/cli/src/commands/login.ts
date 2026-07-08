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

export async function loginCommand(privateKey: string): Promise<void> {
  if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
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

  saveWallet(privateKey, passphrase || undefined);

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
