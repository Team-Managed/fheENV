/**
 * Lit Protocol signer for viem — Finding F-01
 *
 * Replaces the stored `FHEENV_ROTATOR_KEY` private key with a Lit Action-
 * backed signing key. The actual Rotator private key never leaves the Lit
 * Chipotle TEE — it's derived from the action's IPFS CID and is only usable
 * when a valid GitHub OIDC JWT from the authorized workflow is presented.
 *
 * Set these env vars instead of FHEENV_PRIVATE_KEY:
 *   FHEENV_LIT_ACTION_CID  — IPFS CID of lit-actions/rotator-signer.js
 *   FHEENV_LIT_API_KEY     — Lit API usage key (not a signing key)
 *   GITHUB_OIDC_JWT        — GitHub Actions OIDC token (aud=fheenv-rotator)
 */

import axios from "axios";
import { toAccount, type LocalAccount } from "viem/accounts";
import { type TransactionSerializable, type Hex, type Address } from "viem";

// Allow self-hosted or custom Lit deployments via env var
const LIT_API =
  process.env.FHEENV_LIT_API_URL?.replace(/\/$/, "") ?? "https://api.chipotle.litprotocol.com";

interface LitSignResult {
  rawTx?: Hex;
  address?: Address;
  error?: string;
}

async function callLitAction(
  actionCid: string,
  apiKey: string,
  params: Record<string, unknown>,
): Promise<LitSignResult> {
  let res;
  try {
    res = await axios.post(
      `${LIT_API}/core/v1/lit_action`,
      { action_ipfs_id: actionCid, js_params: params },
      { headers: { "Content-Type": "application/json", "X-Lit-API-Key": apiKey } },
    );
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    const body = (err as { response?: { data?: unknown } }).response?.data;
    throw new Error(
      `Lit API request failed${status ? ` (HTTP ${status})` : ""}: ${JSON.stringify(body) ?? (err as Error).message}`,
      { cause: err },
    );
  }
  return (res.data as { response: LitSignResult }).response;
}

/**
 * Fetch the Rotator signing address from the Lit Action.
 * Called once during createClients() to populate account.address.
 */
export async function getLitActionAddress(actionCid: string, apiKey: string): Promise<Address> {
  const result = await callLitAction(actionCid, apiKey, { action: "address" });
  if (result.error) throw new Error(`Lit Action error: ${result.error}`);
  if (!result.address) throw new Error("Lit Action did not return an address");
  return result.address;
}

/**
 * Create a viem LocalAccount backed by the Lit Action signer.
 * Each signTransaction call sends the tx to the Lit network for signing.
 */
export function createLitAccount(
  address: Address,
  actionCid: string,
  apiKey: string,
  oidcJwt: string,
): LocalAccount {
  return toAccount({
    address,

    async signTransaction(tx: TransactionSerializable): Promise<Hex> {
      const gas = (tx as { gas?: bigint }).gas;
      const maxFee = (tx as { maxFeePerGas?: bigint }).maxFeePerGas;
      const maxPriority = (tx as { maxPriorityFeePerGas?: bigint }).maxPriorityFeePerGas;

      // Guard against unresolved fee oracle values — a 0-fee EIP-1559 tx
      // will be accepted by the action but will never be mined.
      if (!maxFee || maxFee === 0n) {
        throw new Error(
          "Lit signer: maxFeePerGas is missing or zero — ensure the wallet client has resolved gas fees before signing",
        );
      }

      const params = {
        action: "sign",
        oidcJwt,
        to: tx.to,
        data: tx.data ?? "0x",
        nonce: tx.nonce,
        chainId: tx.chainId,
        gasLimit: String(gas ?? 300_000n),
        maxFeePerGas: String(maxFee),
        maxPriorityFeePerGas: String(maxPriority ?? 0n),
      };

      const result = await callLitAction(actionCid, apiKey, params);

      if (result.error) {
        throw new Error(`Lit signing failed: ${result.error}`);
      }
      if (!result.rawTx) {
        throw new Error("Lit Action did not return a signed transaction");
      }
      return result.rawTx;
    },

    async signMessage(): Promise<Hex> {
      throw new Error("Lit Rotator account: signMessage not supported (only signTransaction)");
    },

    async signTypedData(): Promise<Hex> {
      throw new Error("Lit Rotator account: signTypedData not supported");
    },
  });
}
