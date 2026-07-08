# fheENV SOC 2 Automated Key Rotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the SOC 2 CC6.3 gap where `revokeAccess()` (logistic revocation) was never automatically followed by `updateEnvironment()`/`batchGrantAccess()` (cryptographic revocation). Add scheduled rotation, IPFS blob lifecycle management, a scoped Rotator contract role, and an audit evidence layer.

**Source spec:** `docs/specs/fheenv-key-rotation-soc2-spec .md` — architecture decisions, control mappings, and the Agoda benchmark comparison are documented there. This plan translates those decisions into concrete file-level tasks.

**Target branch:** `security/soc2-ci-key-management` (already exists, branched from `origin/dev`)

---

## Baseline — Already Implemented

The following controls are **complete** on the current branch and do not need re-implementation:

| Control | What was built                                                                                     | Files                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CC6.1   | scrypt + AES-256-GCM encrypted keyfile; `FHEENV_KEY_PASSPHRASE` env var for non-interactive unlock | `cli/src/lib/wallet.ts`, `cli/src/commands/login.ts`                                                          |
| CC6.3   | `grantAccessWithExpiry()` on-chain + `--expires <duration>` CLI flag                               | `contracts/fheENVRegistry.sol`, `cli/src/commands/team-add.ts`                                                |
| CC6.6   | `memberExpiry` mapping, `expireAccess()` function, `hasAccess()` enforces expiry at contract level | `contracts/fheENVRegistry.sol`, `cli/src/lib/contracts-node.ts`                                               |
| CC7.2   | JSONL audit log (`~/.fheenv/audit.log`, mode 0600); wired into `pull`, `run`, `team add`           | `cli/src/lib/audit.ts`, `cli/src/commands/pull.ts`, `cli/src/commands/run.ts`, `cli/src/commands/team-add.ts` |
| CC8.1   | SOC 2 compliance checklist + time-limited grant examples in docs                                   | `frontend/content/docs/cli/ci-cd.mdx`                                                                         |

---

## Remaining Gaps — Implementation Phases

### Phase 1 — Extract `@fheenv/core` Shared Rotation Library

**Why first:** Every subsequent phase (auto-trigger on remove, scheduled worker, frontend button) needs the same rotation logic. Extracting it now prevents three divergent implementations that an auditor's sampling would catch as inconsistent.

**Files to create:**

- `fheenv/packages/core/package.json`
- `fheenv/packages/core/tsconfig.json`
- `fheenv/packages/core/src/rotate.ts` — pure rotation logic (no chalk/ora/CLI concerns)
- `fheenv/packages/core/src/index.ts`

**Files to modify:**

- `fheenv/pnpm-workspace.yaml` — add `packages/*` to workspace
- `fheenv/cli/package.json` — add `"@fheenv/core": "workspace:*"` dependency
- `fheenv/cli/src/commands/rotate.ts` — replace inline rotation logic with import from `@fheenv/core`

**Tasks:**

- [ ] Create `fheenv/packages/core/` workspace package with `package.json` (`"name": "@fheenv/core"`, `"main": "dist/index.js"`) and `tsconfig.json`
- [ ] Extract the pure rotation logic from `cli/src/commands/rotate.ts` into `packages/core/src/rotate.ts` as an exported `rotateEnvironment(params: RotateParams): Promise<RotateResult>` function — no chalk, no ora, no filesystem reads. Accept `envContent: string` as a parameter instead of reading the file internally; callers are responsible for providing plaintext
- [ ] `RotateParams` must include: `registryAddress`, `projectId`, `envName`, `envContent`, `pinataJwt`, `rpcUrl`, `chainId`, `walletClient`, `publicClient`, `expectedVersion`
- [ ] `RotateResult` must return: `newCid: string`, `previousCid: string`, `newVersion: bigint`, `membersRegranted: Address[]`
- [ ] Export `rotateEnvironment` from `packages/core/src/index.ts`
- [ ] Update `pnpm-workspace.yaml` to include `packages/*`
- [ ] Add `@fheenv/core` to `cli/package.json` dependencies
- [ ] Refactor `cli/src/commands/rotate.ts` to call `rotateEnvironment()` from `@fheenv/core` — keep spinner/chalk around the call, pass `envContent` from the local file read that stays in the command
- [ ] Run `pnpm install` and `pnpm build` to verify the package resolves

---

### Phase 2 — Rotator Contract Role

**Why:** The automation credential that runs scheduled rotation needs to call `updateEnvironment()` and `batchGrantAccess()` without having team-management or ownership-transfer privileges. Giving it the same role as a project owner violates CC6.1 least-privilege and is worse than the manual process it replaces. See spec §4.5 for the full rationale — including the important caveat that a Rotator key is still a high-value credential because it holds live decrypt access to every environment in scope.

**Files to modify:**

- `fheenv/contracts/fheENVRegistry.sol`
- `fheenv/cli/src/lib/contracts-node.ts`
- `fheenv/cli/src/index.ts`

**Files to create:**

- `fheenv/cli/src/commands/rotator.ts`

**Tasks:**

- [ ] Add `mapping(uint256 => mapping(address => bool)) public rotators` to `fheENVRegistry.sol` state section
- [ ] Add events: `event RotatorAdded(uint256 indexed projectId, address indexed rotator)` and `event RotatorRemoved(uint256 indexed projectId, address indexed rotator)`
- [ ] Add `modifier onlyRotatorOrOwner(uint256 projectId)` — passes if `owners[projectId][msg.sender] || rotators[projectId][msg.sender]`
- [ ] Add `function addRotator(uint256 projectId, address rotator) external projectExists(projectId) onlyProjectOwner(projectId)` — sets `rotators[projectId][rotator] = true`, emits `RotatorAdded`
- [ ] Add `function removeRotator(uint256 projectId, address rotator) external projectExists(projectId) onlyProjectOwner(projectId)` — sets `rotators[projectId][rotator] = false`, emits `RotatorRemoved`
- [ ] Change `updateEnvironment()` modifier from `onlyProjectOwner` to `onlyRotatorOrOwner`
- [ ] Change `batchGrantAccess()` modifier from `onlyProjectOwner` to `onlyRotatorOrOwner`
- [ ] Leave `grantAccess()`, `revokeAccess()`, `addOwner()`, `transferOwnership()` gated to `onlyProjectOwner` — a Rotator cannot manage team membership or ownership
- [ ] Add ABI entries for `addRotator`, `removeRotator`, `rotators` (view), `RotatorAdded`, `RotatorRemoved` to `cli/src/lib/contracts-node.ts`
- [ ] Export `addRotator()` and `removeRotator()` TypeScript helpers from `contracts-node.ts`
- [ ] Create `cli/src/commands/rotator.ts` with `rotatorAddCommand(opts)` and `rotatorRemoveCommand(opts)` — both log to audit with action `rotator_added` / `rotator_removed`
- [ ] Add `rotator_added` and `rotator_removed` to `AuditAction` type in `cli/src/lib/audit.ts`
- [ ] Register `fheenv rotator add` and `fheenv rotator remove` sub-commands in `cli/src/index.ts`
- [ ] Update `fheenv/test/fheENVRegistry.test.ts` — add tests for Rotator role: Rotator can call `updateEnvironment`/`batchGrantAccess`, cannot call `revokeAccess`/`addOwner`, non-rotator is rejected

---

### Phase 3 — Auto-Trigger Rotation on `team remove` + IPFS Unpin

**Why:** This is the primary CC6.3 control. Currently `team-remove.ts` and `TeamManager.tsx` both stop at `revokeAccess()` and only print a warning. The gap: the removed member retains FHE decrypt access to the current handles indefinitely unless a human remembers to rotate. This phase closes that gap by making rotation the default, not the exception.

**Key constraint from spec §4.2:** `revokeAccess()` and `updateEnvironment()` are separate transactions. If `revokeAccess()` succeeds but the follow-on rotation fails, the member is logistically revoked but cryptographically still live — this partial-failure state must surface loudly and be retried, not silently swallowed.

**Files to modify:**

- `fheenv/cli/src/commands/team-remove.ts`
- `fheenv/cli/src/lib/ipfs-node.ts`
- `fheenv/cli/src/lib/audit.ts`
- `fheenv/cli/src/commands/rotate.ts`
- `fheenv/cli/src/index.ts`
- `fheenv/frontend/components/TeamManager.tsx`

**Files to create:**

- `fheenv/frontend/app/api/revoke-and-rotate/route.ts`

**Tasks:**

- [ ] Add `trigger` field to `AuditEvent` in `cli/src/lib/audit.ts`: `trigger?: "team_remove" | "scheduled" | "manual_cli" | "manual_frontend"`; add `previousCid?: string` and `unpinStatus?: "success" | "pending" | "failed"` fields
- [ ] Add `unpinFromIPFS(cid: string, jwt: string): Promise<void>` to `cli/src/lib/ipfs-node.ts` using `axios.delete("https://api.pinata.cloud/pinning/unpin/" + cid)` with Bearer JWT auth
- [ ] Modify `cli/src/commands/team-remove.ts`: after `revokeAccess()` succeeds, call `rotateEnvironment()` from `@fheenv/core`; pass `trigger: "team_remove"` to the audit event; if rotation throws, re-throw with a clear message: `"PARTIAL FAILURE: member revoked but rotation failed — run 'fheenv rotate' immediately. Member still has FHE decrypt access to current handles."` — do NOT silently continue
- [ ] Add `--no-rotate` flag to `team remove` in `cli/src/commands/team-remove.ts` and wire it in `cli/src/index.ts` — when set, retain the current warn-only behavior for edge cases (batch multi-remove then single rotate)
- [ ] After successful rotation in `team-remove.ts`, call `unpinFromIPFS(previousCid, config.pinataJwt)` with a 15-second grace delay (configurable via `FHEENV_UNPIN_GRACE_SECONDS`); log `unpinStatus` to audit; on unpin failure, log as `"pending"` and print a warning with the CID so it can be retried — do NOT fail the overall command
- [ ] Pass `trigger: "manual_cli"` in `cli/src/commands/rotate.ts` audit log call; return `previousCid` from the core and pass it through for unpin
- [ ] Create `frontend/app/api/revoke-and-rotate/route.ts` as a Next.js POST route — accepts `{ projectId, envName, member, walletClient serialized }` — calls `@fheenv/core` rotation server-side after the client-side `revokeAccess()` transaction confirms; returns `{ success, newCid, error? }`
- [ ] Modify `frontend/components/TeamManager.tsx` `handleRevoke()`: after `revokeAccess()` transaction confirms on-chain, POST to `/api/revoke-and-rotate`; show a spinner during rotation (not just after revoke); update success message to confirm rotation completed; update warning banner to only appear if the API call returned an error (not as the default success state); pass `trigger: "manual_frontend"` through to audit

---

### Phase 4 — Scheduled Rotation Worker (GitHub Actions Cron)

**Why:** CC6.3 also requires time-based rotation independent of team changes. A 90-day max cadence is the common SOC 2 auditor expectation. Phase 3 handles revocation-triggered rotation; this phase handles the calendar-triggered case.

**Implementation choice from spec §4.1:** GitHub Actions scheduled workflow, not a persistent server process — fheENV has no existing server infra, and Actions run logs are a first-order audit artifact.

**Files to modify:**

- `fheenv/cli/src/lib/config.ts`
- `fheenv/cli/src/index.ts`

**Files to create:**

- `fheenv/cli/src/commands/rotate-check.ts`
- `.github/workflows/rotate-scheduled.yml`

**Tasks:**

- [ ] Add `rotationPolicy?: Record<string, { cronSchedule: string; expireInDays: number; graceMinutes: number }>` to `FheEnvConfig` interface in `cli/src/lib/config.ts`
- [ ] Create `cli/src/commands/rotate-check.ts` — reads `rotationPolicy` from `.fheenv.json`, calls `getEnvironment()` to read `updatedAt` for each configured env, rotates if `now - updatedAt > expireInDays * 86400 - graceMinutes * 60`; pass `trigger: "scheduled"` to audit; exits with code 1 and logs error if any rotation fails (so Actions marks the run as failed)
- [ ] Register `fheenv rotate-check` in `cli/src/index.ts` with description `"Check rotation policy and rotate overdue environments (for use in CI/scheduled workflows)"`
- [ ] Create `.github/workflows/rotate-scheduled.yml` with:
  - `schedule: [{cron: "0 3 * * 0"}]` (weekly Sunday 03:00 UTC, overridden by per-env `cronSchedule`)
  - `workflow_dispatch` trigger for manual runs
  - Steps: checkout → install fheenv CLI → run `fheenv rotate-check` → on failure: send notification (GitHub Actions step summary + optional Slack webhook via `FHEENV_NOTIFY_WEBHOOK` secret)
  - Secrets used: `FHEENV_PRIVATE_KEY` (Rotator key — interim; replaced by Lit Protocol signing once F-01 is complete), `FHEENV_PINATA_JWT`, `FHEENV_NOTIFY_WEBHOOK` (optional)
- [ ] Document the `rotationPolicy` config block format in `frontend/content/docs/cli/ci-cd.mdx` with a concrete `.fheenv.json` example
- [ ] **Note:** once F-01 (OIDC + Lit Protocol) is complete, remove `FHEENV_PRIVATE_KEY` from Actions secrets and replace the wallet setup step with the Lit OIDC session sig flow

---

### Phase 5 — Audit Evidence Indexer + Frontend Dashboard

**Why:** On-chain events are tamper-evident but not auditor-friendly. An aggregated, exportable log with rotation history, last/next rotation dates, and overdue warnings is what the auditor actually reviews. Start collecting early — evidence needs a few rotation cycles of history to be credible.

**Files to create:**

- `fheenv/scripts/index-audit.ts`
- `fheenv/scripts/export-audit.ts`
- `fheenv/frontend/app/(app)/project/[id]/audit/page.tsx`

**Files to modify:**

- `fheenv/frontend/app/(app)/project/[id]/env/[env]/page.tsx`
- `fheenv/frontend/content/docs/cli/ci-cd.mdx`

**Tasks:**

- [ ] Create `scripts/index-audit.ts` — reads `AccessGranted`, `AccessRevoked`, `EnvironmentUpdated`, `AccessGrantedWithExpiry`, `RotatorAdded`, `RotatorRemoved` events from chain (all blocks, paginated); writes JSONL records to `~/.fheenv/audit.log` with all `AuditEvent` fields; deduplicate by `txHash` so re-runs are idempotent; add a `source: "on_chain"` field to distinguish from CLI-written records
- [ ] Create `scripts/export-audit.ts` — reads `~/.fheenv/audit.log`, converts to CSV with headers matching the evidence table in spec §4.6; accepts `--from` and `--to` date flags; writes to `audit-export-<date>.csv`
- [ ] Create `frontend/app/(app)/project/[id]/audit/page.tsx` — per-project rotation history page: table of `EnvironmentUpdated` events (env name, version, timestamp, actor, new CID); per-env last rotation date and next scheduled rotation (read from `.fheenv.json` `rotationPolicy` if present); red warning badge if any env is overdue (`now - updatedAt > expireInDays * 86400`)
- [ ] Modify `frontend/app/(app)/project/[id]/env/[env]/page.tsx` — add a small "Last rotated" timestamp below the Rotate Key button, read from `updatedAt` returned by `getEnvironment()`; add an amber warning if `updatedAt` is older than 90 days
- [ ] Add link to audit page from project page (`frontend/app/(app)/project/[id]/page.tsx`)
- [ ] Document `fheenv index-audit` and `fheenv export-audit` commands in `frontend/content/docs/cli/commands.mdx`

---

### Phase 6 — Frontend Rotate Key Button Wiring

**Why:** Currently the button in `project/[id]/env/[env]/page.tsx` calls `handleRotate()` which is a stub — it sets a log message pointing to the CLI. Phase 1's `@fheenv/core` extraction makes it possible to call real rotation from a Next.js API route. This is the lowest audit-risk phase (it's a UX gap, not a control gap) but important for completeness and for non-technical team members who use the dashboard.

**Note from spec §4.3:** Do not reimplement rotation logic a third time — call `@fheenv/core` from the API route.

**Files to create:**

- `fheenv/frontend/app/api/rotate/route.ts`

**Files to modify:**

- `fheenv/frontend/app/(app)/project/[id]/env/[env]/page.tsx`

**Tasks:**

- [ ] Create `frontend/app/api/rotate/route.ts` — POST route accepting `{ projectId: string, envName: string }`; reads the Rotator key from `FHEENV_PRIVATE_KEY` server-side env var (not exposed to browser); calls `rotateEnvironment()` from `@fheenv/core`; returns `{ success: boolean, newCid: string, version: number, error?: string }`; logs `trigger: "manual_frontend"` to audit
- [ ] Replace the stub `handleRotate()` in `frontend/app/(app)/project/[id]/env/[env]/page.tsx` with a real `fetch("/api/rotate", { method: "POST", body: JSON.stringify({ projectId: id, envName: env }) })`; show spinner during rotation; on success, display new CID and version; on error, display the error message with instructions to run `fheenv rotate` manually as a fallback
- [ ] Add `FHEENV_PRIVATE_KEY` (Rotator key, not owner key) to the Next.js environment variable documentation in `frontend/content/docs/cli/ci-cd.mdx`

---

## Open Finding — Rotator Key Custody: OIDC + Lit Protocol Threshold Signing (F-01)

### Why OIDC alone is not sufficient

OIDC is an _authentication_ protocol — it proves identity but cannot sign an Ethereum transaction. You still need somewhere to store and invoke a signing key. The question is what holds that key and who can authorize its use. Two viable options:

| Approach                                       | How it works                                                                                                                                                                                 | Fits fheENV?                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub OIDC → KMS** (AWS/GCP/Azure)          | GitHub Actions OIDC JWT exchanges for short-lived cloud credentials → KMS holds the Ethereum key → custom viem signer calls `kms.sign()`                                                     | Good — eliminates stored cloud credentials. But requires cloud vendor dependency and KMS doesn't natively understand Ethereum — needs a custom signer wrapper.                                                                                                       |
| **GitHub OIDC → Lit Protocol** _(recommended)_ | GitHub Actions OIDC JWT is validated by a Lit Action as an auth condition → Lit PKP (Programmable Key Pair) threshold-signs the Ethereum transaction → no single party holds the Rotator key | Best — no cloud vendor, no stored secret anywhere, no single party (not even fheENV team) holds the key. Architecturally mirrors CoFHE: fheENV already uses a threshold FHE network for the AES key halves; Lit extends the same pattern to the Rotator signing key. |

### Why Lit Protocol is the right fit

fheENV's thesis is "not even us" — the platform operator is cryptographically incapable of reading secrets. The current Rotator key (a raw private key in a GitHub Actions secret) is a direct contradiction of that: fheENV team members with repo admin access can read it. Lit Protocol eliminates this: the Rotator signing key is held as threshold shares across the Lit network; no single node (and no team member) holds the full key. The Lit Action — a JavaScript function stored on IPFS — validates the GitHub OIDC JWT claims (repo, workflow ref, environment) and only authorizes signing if they match. This is a closer parallel to CoFHE's threshold decrypt than any KMS approach.

### Implementation path

**Files to create:**

- `fheenv/cli/src/lib/lit-signer.ts` — creates a viem-compatible custom `Account` using a Lit PKP. Accepts a Lit session signature (from OIDC JWT) and returns an account object whose `signTransaction` calls the Lit network instead of a local private key.
- `fheenv/lit/rotation-action.js` — the Lit Action (IPFS-stored JS) that validates the GitHub OIDC JWT: checks `aud`, `iss`, `sub` (repo), `job_workflow_ref`, and authorizes the PKP to sign if conditions pass.
- `fheenv/lit/README.md` — documents the PKP address (registered as Rotator via `fheenv rotator add`), the Lit Action IPFS CID, and how to re-deploy the Action if logic changes.

**Files to modify:**

- `fheenv/cli/src/lib/wallet.ts` — add `loadLitAccount(sessionSig)` export that returns a Lit-backed viem Account; `createClients()` picks it up automatically when `FHEENV_LIT_SESSION` env var is set
- `.github/workflows/rotate-scheduled.yml` — replace `FHEENV_PRIVATE_KEY` secret with OIDC JWT fetch + Lit session sig generation; the workflow authenticates to Lit using the GitHub OIDC token, gets a session sig scoped to the rotation Action IPFS CID, sets `FHEENV_LIT_SESSION` env var

**Dependencies to add to `cli/package.json`:**

- `@lit-protocol/lit-node-client` — connect to Lit network and execute PKP signing
- `@lit-protocol/auth-helpers` — generate session signatures from OIDC JWTs

**Tasks:**

- [ ] Mint a Lit PKP for the Rotator role (one-time setup via Lit Explorer or `@lit-protocol/contracts-sdk`); record the PKP's Ethereum address
- [ ] Register the PKP Ethereum address as Rotator: `fheenv rotator add --member <PKP_ETH_ADDRESS>`
- [ ] Write `fheenv/lit/rotation-action.js` — validates GitHub OIDC JWT claims (`repository`, `job_workflow_ref`, `environment`) against expected values; calls `LitActions.signEcdsa()` only if all claims match; store on IPFS and record the CID
- [ ] Add `@lit-protocol/lit-node-client` and `@lit-protocol/auth-helpers` to `cli/package.json`
- [ ] Create `cli/src/lib/lit-signer.ts` — `createLitAccount(sessionSig: SessionSig, pkpPublicKey: string): Account` returning a viem custom Account whose `signTransaction` and `signMessage` call the Lit PKP via `litNodeClient.executeJs()`
- [ ] Update `cli/src/lib/wallet.ts` `createClients()`: if `FHEENV_LIT_SESSION` env var is set, load `createLitAccount()` instead of `privateKeyToAccount()` — drop-in replacement, no other command changes needed
- [ ] Update `.github/workflows/rotate-scheduled.yml`: add `id-token: write` permission; add a step that fetches the GitHub OIDC JWT and calls `litNodeClient.getSessionSigs()` with the rotation Action IPFS CID as the permitted resource; writes the session sig to `FHEENV_LIT_SESSION`; remove `FHEENV_PRIVATE_KEY` from secrets once validated
- [ ] Open a tracked issue: "F-01: Migrate Rotator key to OIDC + Lit Protocol threshold signing" — target: before SOC 2 Type II surveillance audit. Document as a disclosed remediation item with a target date in the SOC 2 policy narrative.

---

## Execution Order

| Phase                                     | Prerequisite                                     | Audit priority                                        |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| 1 — `@fheenv/core` extraction             | None                                             | Blocker for 3 and 6                                   |
| 2 — Rotator contract role                 | None (can run in parallel with 1)                | Required before anything automated signs transactions |
| 3 — Auto-trigger on `team remove` + unpin | Phases 1 and 2 complete                          | **Highest** — this is the CC6.3 gap                   |
| 5 — Audit evidence indexer                | Phase 3 (needs a few rotation cycles of history) | Start early — evidence collection needs time          |
| 4 — Scheduled rotation worker             | Phases 1, 2, and 3 complete                      | Second-order CC6.3 strengthening                      |
| 6 — Frontend button wiring                | Phase 1 complete                                 | Lowest audit risk — sequence last                     |

**Minimum viable for audit:** Phases 1, 2, 3, and 5. Phase 4 strengthens the story; Phase 6 is product quality.
