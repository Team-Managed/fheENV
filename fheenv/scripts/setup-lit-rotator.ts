/**
 * setup-lit-rotator.ts
 *
 * One-time setup: substitutes project-specific values into the Lit Action
 * template, uploads the result to IPFS, and prints the post-setup commands.
 *
 * Usage:
 *   FHEENV_LIT_API_KEY=<key> ts-node scripts/setup-lit-rotator.ts
 *   FHEENV_LIT_API_KEY=<key> ts-node scripts/setup-lit-rotator.ts \
 *     --repo owner/repo --workflow .github/workflows/rotate-scheduled.yml
 *
 * FHEENV_LIT_API_URL can be set to target a self-hosted or custom Lit node.
 *
 * After running:
 *   1. fheenv rotator add --address <printed-address>
 *   2. fheenv team add --member <printed-address>  (FHE decrypt access)
 *   3. Set FHEENV_LIT_ACTION_CID as a GitHub Actions variable (not secret)
 *   4. Set FHEENV_LIT_API_KEY as a GitHub Actions secret
 *   5. Remove FHEENV_ROTATOR_KEY from GitHub Actions secrets
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import FormData from "form-data";
import axios from "axios";

const TEMPLATE_PATH = path.resolve(__dirname, "../lit-actions/rotator-signer.js");
const PLACEHOLDER_REPO = "<<FHEENV_REPO>>";
const PLACEHOLDER_WORKFLOW = "<<FHEENV_WORKFLOW>>";
const DEFAULT_WORKFLOW = ".github/workflows/rotate-scheduled.yml";

const LIT_API = (process.env.FHEENV_LIT_API_URL ?? "https://api.chipotle.litprotocol.com").replace(
  /\/$/,
  "",
);

function parseArgs(): { repo?: string; workflow?: string } {
  const args = process.argv.slice(2);
  const out: { repo?: string; workflow?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo" && args[i + 1]) out.repo = args[++i];
    if (args[i] === "--workflow" && args[i + 1]) out.workflow = args[++i];
  }
  return out;
}

function inferRepoFromGit(): string {
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
    const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // git not available or no remote
  }
  throw new Error("Could not infer repo from git remote. Pass --repo owner/repo explicitly.");
}

function failHttp(err: unknown, label: string): never {
  const status = (err as { response?: { status?: number } }).response?.status;
  const body = (err as { response?: { data?: unknown } }).response?.data;
  console.error(`${label}${status ? ` (HTTP ${status})` : ""}:`, body ?? (err as Error).message);
  process.exit(1);
}

async function main(): Promise<void> {
  const apiKey = process.env.FHEENV_LIT_API_KEY;
  if (!apiKey) {
    console.error("Error: FHEENV_LIT_API_KEY env var is required.");
    process.exit(1);
  }

  const args = parseArgs();
  const repo = args.repo ?? inferRepoFromGit();
  const workflow = args.workflow ?? DEFAULT_WORKFLOW;

  // ── Validate template ──────────────────────────────────────────────────────
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  if (!template.includes(PLACEHOLDER_REPO) || !template.includes(PLACEHOLDER_WORKFLOW)) {
    console.error(
      `Error: Template missing placeholders ${PLACEHOLDER_REPO} / ${PLACEHOLDER_WORKFLOW}.\n` +
        `Check that lit-actions/rotator-signer.js has not been manually edited.`,
    );
    process.exit(1);
  }

  const source = template.replace(PLACEHOLDER_REPO, repo).replace(PLACEHOLDER_WORKFLOW, workflow);

  console.log(`Configuring for repo:    ${repo}`);
  console.log(`            workflow:    ${workflow}`);
  console.log(`            Lit API:     ${LIT_API}\n`);

  // ── Upload to IPFS via Lit API ─────────────────────────────────────────────
  console.log("Uploading action to IPFS via Lit...");
  const formData = new FormData();
  formData.append("file", Buffer.from(source), { filename: "rotator-signer.js" });

  let cid: string;
  try {
    const res = await axios.post(`${LIT_API}/core/v1/ipfs`, formData, {
      headers: { ...formData.getHeaders(), "X-Lit-API-Key": apiKey },
    });
    cid = (res.data as { ipfs_id: string }).ipfs_id;
  } catch (err) {
    failHttp(err, "IPFS upload failed");
  }

  console.log(`✓ Uploaded — IPFS CID: ${cid!}`);

  // ── Retrieve signing address ───────────────────────────────────────────────
  console.log("\nRetrieving signing address...");
  let address: string;
  try {
    const res = await axios.post(
      `${LIT_API}/core/v1/lit_action`,
      { action_ipfs_id: cid, js_params: { action: "address" } },
      { headers: { "Content-Type": "application/json", "X-Lit-API-Key": apiKey } },
    );
    address = (res.data as { response: { address: string } }).response.address;
  } catch (err) {
    failHttp(err, "Address retrieval failed");
  }

  console.log(`✓ Rotator signing address: ${address!}`);

  // ── Print next steps ───────────────────────────────────────────────────────
  console.log(`
────────────────────────────────────────────────────────────────
Next steps:

1. Grant the Rotator contract role (can rotate, cannot manage team):

     fheenv rotator add --address ${address!}

2. Grant FHE decrypt access (needed to re-encrypt during rotation):

     fheenv team add --member ${address!}

3. Set as a GitHub Actions variable (not secret — it is a content hash):

     Name:  FHEENV_LIT_ACTION_CID
     Value: ${cid!}

4. Set your Lit API key as a GitHub Actions secret:

     Name:  FHEENV_LIT_API_KEY
     (This is a usage key, not the signing key — compromise of it
      alone cannot produce signatures without a valid OIDC JWT.)

5. Remove FHEENV_ROTATOR_KEY from GitHub Actions secrets.

────────────────────────────────────────────────────────────────
Finding F-01 resolved: the Rotator signing key lives in the Lit
Chipotle TEE, derived from the action IPFS CID. The key cannot
be extracted and is only usable by the exact workflow pinned in
lit-actions/rotator-signer.js for ${repo}.
────────────────────────────────────────────────────────────────`);
}

main().catch((err) => {
  console.error("Setup failed:", (err as Error).message);
  process.exit(1);
});
