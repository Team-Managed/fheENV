// @ts-ignore — @cofhe/sdk/node provides Node.js-specific FHE client
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/node";
import { getChainById, chains } from "@cofhe/sdk/chains";
import { Encryptable, FheTypes, type CofheClient } from "@cofhe/sdk";
import { type PublicClient, type WalletClient } from "viem";
import { type InEuint128 } from "./contracts-node";

// Re-export for command use
export { Encryptable, FheTypes };

export interface FheEncryptedUint128 {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: `0x${string}`;
}

export async function createFheClient(
  chainId: number,
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<CofheClient> {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ${chainId}. Supported: ${Object.keys(chains).join(", ")}`);
  }
  // @ts-ignore
  const config = createCofheConfig({ supportedChains: [chain] });
  // @ts-ignore
  const client = createCofheClient(config);
  // @ts-ignore — viem version mismatch between CLI and @cofhe/sdk
  await client.connect(publicClient, walletClient);
  return client;
}

export async function fheEncryptUint128(
  client: CofheClient,
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
  client: CofheClient,
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
