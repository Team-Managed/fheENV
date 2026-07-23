/**
 * fheENV Rotator Signer — Lit Action
 *
 * TEMPLATE — do NOT upload this file directly.
 * Run `ts-node scripts/setup-lit-rotator.ts` which substitutes the
 * <<FHEENV_REPO>> and <<FHEENV_WORKFLOW>> placeholders for your project
 * before uploading to IPFS.
 *
 * Security model:
 * JWT issuer, repo, and workflow ref are baked into the uploaded content.
 * The content hash is the IPFS CID, which determines the signing address.
 * Any edit — including repo/workflow changes — produces a different CID and
 * therefore a different address that has not been granted the Rotator role.
 * Forked or modified copies of this action cannot sign for your project.
 *
 * Signing (called by rotate-scheduled.yml):
 *   POST /core/v1/lit_action
 *   js_params: { action:"sign", oidcJwt, to, data, nonce,
 *                chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas }
 */

// ── Trust anchors — substituted by setup-lit-rotator.ts before upload ─────────
// DO NOT edit these directly. Run the setup script.

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const ALLOWED_REPO = "<<FHEENV_REPO>>"; // e.g. "owner/repo"
const ALLOWED_WORKFLOW = "<<FHEENV_WORKFLOW>>"; // e.g. ".github/workflows/rotate-scheduled.yml"
const EXPECTED_AUDIENCE = "fheenv-rotator"; // must match workflow OIDC request

// ── ESM imports (pinned — changing the version changes the CID) ───────────────

import { jwtVerify, createRemoteJWKSet } from "jose@5.6.3";

// ── Action entry point ────────────────────────────────────────────────────────

async function main({
  action,
  oidcJwt,
  to,
  data,
  nonce,
  chainId,
  gasLimit,
  maxFeePerGas,
  maxPriorityFeePerGas,
}) {
  const wallet = new ethers.Wallet(await Lit.Actions.getLitActionPrivateKey());

  // Return the signing address for setup (no auth required — address is public)
  if (action === "address") {
    return Lit.Actions.setResponse({ response: { address: wallet.address } });
  }

  // ── Verify GitHub OIDC JWT ──────────────────────────────────────────────────
  if (!oidcJwt) {
    return Lit.Actions.setResponse({ response: { error: "oidcJwt is required" } });
  }

  let claims;
  try {
    const JWKS = createRemoteJWKSet(new URL(GITHUB_JWKS_URL));
    const { payload } = await jwtVerify(oidcJwt, JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: EXPECTED_AUDIENCE,
    });
    claims = payload;
  } catch (err) {
    return Lit.Actions.setResponse({
      response: { error: `JWT verification failed: ${err.message}` },
    });
  }

  if (claims.repository !== ALLOWED_REPO) {
    return Lit.Actions.setResponse({
      response: { error: `unauthorized repository: ${claims.repository}` },
    });
  }
  // job_workflow_ref is "<path>@refs/heads/<branch>" — strip the git ref suffix
  const workflowPath = String(claims.job_workflow_ref || "").split("@")[0];
  if (workflowPath !== ALLOWED_WORKFLOW) {
    return Lit.Actions.setResponse({
      response: { error: `unauthorized workflow: ${claims.job_workflow_ref}` },
    });
  }

  // ── Sign the EVM transaction ────────────────────────────────────────────────
  const tx = {
    to,
    data,
    nonce: Number(nonce),
    chainId: Number(chainId),
    gasLimit: ethers.BigNumber.from(String(gasLimit)),
    maxFeePerGas: ethers.BigNumber.from(String(maxFeePerGas)),
    maxPriorityFeePerGas: ethers.BigNumber.from(String(maxPriorityFeePerGas)),
    type: 2,
    value: ethers.BigNumber.from("0"),
  };

  const rawTx = await wallet.signTransaction(tx);

  return Lit.Actions.setResponse({
    response: {
      rawTx,
      signer: wallet.address,
      chainId: tx.chainId,
      to: tx.to,
    },
  });
}

main(js_params).catch((err) => Lit.Actions.setResponse({ response: { error: err.message } }));
