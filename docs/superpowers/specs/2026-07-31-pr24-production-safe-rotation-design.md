# PR #24 Production-Safe Rotation Repair Design

## Objective

Repair PR #24 on top of the current `dev` branch so production-team pilots can
use manual key rotation and member removal safely. Keep compliance claims
limited to controls the product actually enforces. Scheduled unattended
rotation remains disabled until issue #34 provides an external signer or
workload-identity design that does not depend on a long-lived raw private key.

## Scope

This repair includes:

- the current UUPS registry, governed upgrade path, primary-owner rules, and
  `removeOwner` behavior from `dev`;
- automatic cryptographic rotation after `fheenv team remove`;
- encrypted local wallet storage with a non-echoing passphrase prompt;
- shared, tested rotation logic used by manual CLI commands;
- chronological reconstruction of current environment members;
- explicit partial-failure reporting and a deterministic recovery command;
- local audit export described as local operational evidence;
- minimal, consented product analytics for early adoption signals.

This repair excludes:

- scheduled GitHub Actions rotation;
- repository secrets containing a raw blockchain private key;
- the broad on-chain Rotator role;
- time-limited grants that cannot revoke existing CoFHE permissions;
- hardcoded Sepolia Blockscout indexing;
- PostHog or any analytics path presented as audit evidence;
- Lit signer code and robot-wallet setup scripts;
- claims that SOC 2 controls are "implemented and operating";
- mainnet-readiness claims.

## Integration Strategy

Implement the scoped rotation, wallet, audit, and analytics changes directly on
the current `dev` branch. Preserve the UUPS registry and current
owner-management behavior. New contract storage, if any remains necessary,
must be appended after the existing UUPS storage layout.

The resulting work must not be merged into `main` automatically. It will be
pushed only after the full verification suite is green and its final diff is
reviewed.

## Contract Design

Manual rotation remains project-owner authorized. The repair does not add the
Rotator role because there is no production-safe unattended signer in this
scope. It also does not add expiring-grant behavior because clearing a Solidity
mapping cannot revoke access to existing CoFHE ciphertext handles.

The current UUPS proxy behavior remains intact. Upgrade tests must prove that
project metadata, owners, environments, versions, and member permissions
survive a real implementation upgrade.

Rotation continues to require an expected environment version so concurrent
writes fail rather than overwrite each other.

## Rotation and Removal Flow

`fheenv team remove` performs these operations:

1. Read and validate project configuration.
2. Revoke the member in the registry.
3. Read the current encrypted environment and decrypt it with the owner's
   authorized wallet.
4. Generate a new AES key and upload a newly encrypted blob.
5. Update the environment using optimistic version locking.
6. Regrant the new FHE handles to the current active members except the removed
   address.
7. Record the outcome locally and report the previous and new versions.

The environment update and member regrant remain separate transactions in this
repair because adding a new atomic contract operation would expand the audit
surface. If the environment update succeeds but regranting fails, the command
must exit non-zero, identify the environment as partially rotated, avoid
claiming success, preserve the new CID/version, and print the exact idempotent
recovery command.

`--no-rotate` remains an explicit emergency/development escape hatch. It must
display that the removed member retains cryptographic access to the current
handles and record that rotation was intentionally skipped.

## Membership Reconstruction

Membership is derived by replaying relevant events in block and log-index
order. Each grant sets the member active, each revocation sets the member
inactive, and a later grant reactivates the member. The reducer must not use
set subtraction.

The deployment block is mandatory for event replay. The CLI must fail with
recovery guidance when it is missing instead of silently substituting
`currentBlock - 200`.

Because time-limited grants are excluded, the reducer only needs permanent
grant and revocation events in this repair.

## Wallet Custody

New local wallets are encrypted by default using the existing scrypt and
AES-GCM format. Interactive passphrases are non-echoing. Production mode must
not create or silently load a plaintext wallet.

Legacy plaintext wallets remain readable only through an explicit migration
path that writes the encrypted replacement before removing or deprecating the
old representation. Provider credentials are not moved into project
configuration as part of this PR; broader credential-provider and external
signer work remains tracked by issue #34.

## Audit Evidence

Local audit records are operational diagnostics, not a durable compliance
ledger. A requested audit write must return success or a visible error; errors
must not be silently swallowed on security-sensitive operations.

The export command reads the local append-only log and produces deterministic
CSV. On-chain indexing must use the configured chain/provider and must never
advance its checkpoint after an incomplete or failed fetch. The hardcoded
Sepolia Blockscout implementation is excluded.

Durable centralized retention, alerting, and incident evidence remain in issue
#38.

## Minimal Product Analytics

CLI analytics are opt-in during `fheenv init` and disabled by default until the
user gives consent. Consent is stored as a boolean preference and can be
changed later. A random installation identifier is generated only after
consent so aggregate usage can distinguish installations without using a
wallet, project, account, or machine identifier.

Only this allowlist is emitted:

- `cli_initialized`
- `project_created`
- `environment_pushed`
- `environment_pulled`
- `member_added`
- `member_removed`
- `rotation_completed`
- `rotation_failed`

Events may include the CLI version, operating-system family, command success,
and coarse duration bucket. They must not include wallet addresses, project
IDs, environment names, CIDs, chain transaction hashes, command arguments,
error messages, file paths, IP addresses added by application code, or any
secret-derived value. Analytics failures are ignored because they must never
block or alter CLI behavior.

Frontend analytics are limited to anonymous page views and documented
high-level conversion events. Analytics code remains independent from audit
logging and security monitoring. Documentation states what is collected and
how to disable it.

## Error Handling

- Configuration, credential, decryption, upload, chain, and regrant failures
  produce non-zero CLI exits.
- Partial rotation is a distinct result, not a success with a warning.
- Event-index failures preserve the last successful checkpoint.
- Audit-write failures are visible for security-sensitive commands.
- Analytics failures never affect command results.
- Logs and telemetry redact known credential values.

## Verification

The repair requires:

- contract tests for the retained UUPS and owner authorization behavior;
- a real UUPS state-preservation upgrade test;
- reducer tests for grant, revoke, and revoke-then-regrant ordering;
- rotation tests for success, version conflict, upload failure, update failure,
  and member-regrant partial failure;
- team-removal tests proving rotation is default and skipped rotation is
  explicit;
- wallet tests for encrypted creation, wrong passphrase, non-echoing input, and
  legacy migration;
- audit tests proving failed fetches do not advance checkpoints and failed
  writes are visible;
- analytics tests proving default-off consent, event allowlisting, payload
  redaction, and failure isolation;
- a workspace install/build/test/lint/format run using the same commands as CI.

No scheduled rotation, production SOC 2 operation, or mainnet support is
claimed by this repair.
