import { saveWallet } from "../lib/wallet";
import chalk from "chalk";

export async function loginCommand(privateKey: string): Promise<void> {
  if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
    throw new Error(
      "Invalid private key format. Must be a 0x-prefixed 32-byte hex string.",
    );
  }
  saveWallet(privateKey);
  console.log(
    chalk.green("✓ Wallet saved to ~/.fheenv/wallet.json (permissions: 0600)"),
  );
  console.log(
    chalk.yellow(
      "Keep your private key secure. Never commit it to version control.",
    ),
  );
}
