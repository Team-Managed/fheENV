import { createCofheConfig, createCofheClient } from "@cofhe/sdk/node";
import { getChainById } from "@cofhe/sdk/chains";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { type PublicClient, type WalletClient } from "viem";
import { type InEuint128 } from "./contracts";

// Re-export for command use
export { Encryptable, FheTypes };

export interface FheEncryptedUint128 {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: `0x${string}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCofheClient = any;

export async function createFheClient(
  chainId: number,
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<AnyCofheClient> {
  const chain = getChainById(chainId);
  if (!chain) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const supportedChains = Object.keys(require("@cofhe/sdk/chains").chains).join(", ");
    throw new Error(`Unsupported chain ${chainId}. Supported: ${supportedChains}`);
  }
  const config = createCofheConfig({ supportedChains: [chain] });
  const client = createCofheClient(config);
  // viem version in workspace differs from @cofhe/sdk's expected Client type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.connect(publicClient as any, walletClient as any);
  return client;
}

export async function fheEncryptUint128(
  client: AnyCofheClient,
  value: bigint,
  account: `0x${string}`,
  chainId: number,
): Promise<FheEncryptedUint128> {
  const [encrypted] = await client
    .encryptInputs([Encryptable.uint128(value)])
    .setAccount(account)
    .setChainId(chainId)
    .execute();
  return {
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone,
    utype: Number(encrypted.utype),
    signature: encrypted.signature as `0x${string}`,
  };
}

export async function fheDecryptUint128(
  client: AnyCofheClient,
  ctHash: bigint,
  chainId: number,
  _publicClient: PublicClient,
  _walletClient: WalletClient,
): Promise<bigint> {
  // getOrCreateSelfPermit uses the already-connected client — no args needed
  await client.permits.getOrCreateSelfPermit();
  const value = await client.decryptForView(ctHash, FheTypes.Uint128).setChainId(chainId).execute();
  return value as bigint;
}

export function toInEuint128(enc: FheEncryptedUint128): InEuint128 {
  return {
    ctHash: enc.ctHash,
    securityZone: enc.securityZone,
    utype: enc.utype,
    signature: enc.signature,
  };
}
