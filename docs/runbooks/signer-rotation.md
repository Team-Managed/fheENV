# Signer rotation and loss response

This runbook covers Ledger loss, AWS KMS replacement, external custody
replacement, Safe owner changes, and project co-owner removal. Never rotate by
placing a raw Ethereum key in a command argument, project file, or production
environment variable.

Before starting, identify separately:

- the UUPS proxy owner that authorizes implementation upgrades;
- the project primary owner and co-owners;
- the member address permitted to decrypt each environment;
- the account paying gas on the selected supported chain.

Every procedure follows: **Detection → Containment → Rotation → Authorization
update → Validation → Revocation → Evidence capture**.

## Ledger lost, stolen, or replaced

1. **Detection** — Record when the device was lost or suspected compromised,
   its configured derivation path, and affected address. Do not record the seed.
2. **Containment** — Stop operations using that address. If it is a Safe owner,
   start the approved Safe recovery process. If it is a project/member address,
   prepare removal from a different authorized signer.
3. **Rotation** — Initialize a replacement device from a newly generated seed
   unless organizational recovery policy explicitly approves restoring the old
   seed. Configure Ledger and verify the address on-device.
4. **Authorization update** — Add the new Safe/project/member address first.
   Fund it only with the minimum native token needed for approved operations.
5. **Validation** — Verify the displayed address, chain, test signature,
   project read, and one approved transaction simulation. For member access,
   prove the new address can decrypt current handles.
6. **Revocation** — Remove the old Safe owner or project co-owner. For a member,
   run `fheenv team remove ...` and complete rotation; do not use `--no-rotate`.
7. **Evidence capture** — Retain device inventory change, approvals, address
   proofs, funding transaction, authorization transactions, validation, and
   revocation/rotation receipts.

## AWS KMS disable and replacement

1. **Detection** — Correlate CloudTrail/KMS anomalies, IAM changes, failed
   signature verification, or suspected workload compromise.
2. **Containment** — Disable the KMS key or deny `kms:Sign`; revoke the workload
   role session and stop affected jobs.
3. **Rotation** — Create an `ECC_SECG_P256K1` replacement key, derive its
   Ethereum address independently, and configure the CLI with key ARN plus
   expected address.
4. **Authorization update** — Restrict IAM to `GetPublicKey` and `Sign` on the
   replacement key, with OIDC claims and organization conditions. Add the new
   address to the Safe/project/environment as applicable.
5. **Validation** — Run the protected KMS integration workflow. It must retrieve
   the public key, sign a policy-approved zero-value transaction without
   broadcasting, canonicalize it, and recover the expected address.
6. **Revocation** — Remove the old address after the replacement works. Schedule
   KMS deletion only after the required recovery window and evidence retention.
7. **Evidence capture** — Retain KMS key IDs (not key material), policy versions,
   CloudTrail events, workflow run, approvals, authorization transactions, and
   deletion schedule.

## External custody signer replacement

1. **Detection** — Confirm unexpected signing, identity failure, binary change,
   provider outage, or provider compromise.
2. **Containment** — Disable the workload identity and executable mapping. Stop
   jobs rather than falling back to a local key.
3. **Rotation** — Provision a replacement custody key/provider wrapper and
   verify its binary provenance and protocol conformance.
4. **Authorization update** — Add its expected address to the required
   Safe/project/environment and give the process only required provider scopes.
5. **Validation** — Verify get-address, message, typed-data, and transaction
   signatures; test timeout/output limits and local recovery.
6. **Revocation** — Remove the old address, token, workload identity, executable,
   and member access. Rotate environments the old address could decrypt.
7. **Evidence capture** — Retain provider audit IDs, executable digest,
   conformance results, approvals, transactions, and revocation confirmation.

## Safe or proxy owner replacement

1. **Detection** — Record owner loss/compromise or the scheduled governance
   change. Read the ERC-1967 implementation and proxy owner on-chain.
2. **Containment** — Pause upgrade proposals. Trigger Safe guard/recovery
   controls and notify remaining signers.
3. **Rotation** — Add a verified organization-controlled replacement owner.
4. **Authorization update** — Reach the required Safe threshold and, where
   applicable, transfer proxy ownership to the replacement Safe/timelock.
5. **Validation** — Re-read Safe owners/threshold, proxy owner, implementation
   slot, timelock configuration, and project/application behavior.
6. **Revocation** — Remove the compromised owner only after the replacement
   threshold is usable. Revoke its off-chain provider access.
7. **Evidence capture** — Retain Safe proposal, simulation, signatures,
   execution receipt, on-chain state reads, review, and incident/change ticket.

## Project co-owner or primary owner replacement

1. **Detection** — Identify projects, environments, and historical access for
   the departing or compromised owner.
2. **Containment** — Stop its off-chain signer credentials and prevent new
   approvals where governance permits.
3. **Rotation** — Add the replacement co-owner. To replace the primary owner,
   call `transferOwnership`; a primary owner cannot remove itself.
4. **Authorization update** — Verify the new owner can read project state and
   perform an approved management action. Fund it minimally for gas.
5. **Validation** — Confirm on-chain owner mappings/events and application
   behavior. Export local audit evidence.
6. **Revocation** — The primary owner calls `team remove-owner` for a co-owner,
   or ownership transfer removes the former primary owner. Separately remove
   member access and rotate every environment the old address could decrypt.
7. **Evidence capture** — Retain approvals, funding, owner/member transaction
   hashes, environment rotation receipts, validation, and revocation time.

If any authorization change or environment rotation partly fails, stop and use
the CLI's printed idempotent recovery command. Do not report completion until
all on-chain receipts, decryption checks, and provider revocations pass.
