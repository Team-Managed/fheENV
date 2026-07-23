# Lit Actions - Scheduled Key Rotation

This directory contains the Lit Action used for securely rotating FHE keys in an automated environment (e.g., GitHub Actions) via Lit Protocol's Trusted Execution Environment (TEE).

## Setup Instructions

To deploy the Lit Action and obtain the secure rotator key, follow these steps:

1. **Deploy to Lit Protocol:**
   Substitute project-specific values into the Lit Action template and upload it to IPFS:

   ```sh
   FHEENV_LIT_API_KEY=<key> ts-node scripts/setup-lit-rotator.ts
   ```

   _(You can also pass `--repo owner/repo --workflow path/to/workflow.yml` explicitly)._

2. **Grant the Rotator contract role:**
   Using the address output by the setup script, grant the on-chain role (can rotate, cannot manage team):

   ```sh
   fheenv rotator add --address <address>
   ```

3. **Grant FHE decrypt access:**
   The rotator needs decrypt access to re-encrypt during rotation:

   ```sh
   fheenv team add --member <address>
   ```

4. **Configure GitHub Actions:**
   - Set `FHEENV_LIT_ACTION_CID` as a **variable** (not secret — it is a content hash).
   - Set `FHEENV_LIT_API_KEY` as a **secret** (this is a usage key, not the signing key).
   - _Remove `FHEENV_ROTATOR_KEY` from secrets as it is no longer needed (Finding F-01)._

## Finding F-01

The Rotator signing key lives in the Lit Chipotle TEE, derived from the action IPFS CID. The key cannot be extracted and is only usable by the exact workflow pinned in `rotator-signer.js` for your specific repository.
