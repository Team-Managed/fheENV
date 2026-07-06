import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import os from "os";

const KEYFILE_PATH = path.join(os.homedir(), ".fheenv", "wallet.json");

export function loadAccountKey(): `0x${string}` {
  const pk = process.env.FHEENV_PRIVATE_KEY;
  if (pk) return pk as `0x${string}`;
  if (fs.existsSync(KEYFILE_PATH)) {
    const keyfile = JSON.parse(fs.readFileSync(KEYFILE_PATH, "utf-8"));
    return keyfile.privateKey as `0x${string}`;
  }
  throw new Error("No wallet found. Run `fheenv login` first or set FHEENV_PRIVATE_KEY.");
}

export function saveWallet(privateKey: string): void {
  const dir = path.dirname(KEYFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KEYFILE_PATH, JSON.stringify({ privateKey }), {
    mode: 0o600,
  });
}

export interface ViemClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: PrivateKeyAccount;
}

export function createClients(rpcUrl: string, chainId: number): ViemClients {
  const pk = loadAccountKey();
  const account = privateKeyToAccount(pk);

  const chain: Chain = {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  }) as WalletClient;

  return { publicClient, walletClient, account };
}
