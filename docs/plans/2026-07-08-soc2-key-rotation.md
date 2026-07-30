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

### Phase 1 — Extract `@fheenv/core` Shared Rotation Library ✅

**Why first:** Every subsequent phase (auto-trigger on remove, scheduled worker) needs the same rotation logic. Extracting it now prevents divergent implementations.

**Files created:**

- `fheenv/core/package.json`
- `fheenv/core/tsconfig.json`
- `fheenv/core/src/aes.ts`, `ipfs.ts`, `contracts.ts`, `fhe.ts`, `env-parser.ts`, `audit.ts`
- `fheenv/core/src/rotate.ts` — `rotateEnvironment(params): Promise<RotateResult>`
- `fheenv/core/src/index.ts`

**Files modified:**

- `fheenv/pnpm-workspace.yaml` — added `core`
- `fheenv/cli/package.json` — added `"@fheenv/core": "workspace:*"`
- `fheenv/cli/src/commands/rotate.ts` — calls `rotateEnvironment()` from `@fheenv/core`
- `fheenv/cli/src/lib/aes-node.ts`, `ipfs-node.ts`, `contracts-node.ts`, `fhe-node.ts`, `env-parser-node.ts`, `audit.ts` — re-export shims pointing to `@fheenv/core`

- [x] Create `fheenv/core/` workspace package
- [x] Extract rotation logic into `core/src/rotate.ts` as `rotateEnvironment()`
- [x] `RotateResult` returns `newCid`, `previousCid`, `newVersion`, `membersRegranted`
- [x] Update `pnpm-workspace.yaml`, `cli/package.json`
- [x] Refactor `cli/src/commands/rotate.ts` to call `rotateEnvironment()`
- [x] `pnpm build` passes

---

### Phase 2 — Rotator Contract Role ✅

**Why:** The automation credential that runs scheduled rotation needs to call `updateEnvironment()` and `batchGrantAccess()` without team-management or ownership-transfer privileges. See spec §4.5 for the full rationale.

**Files modified:**

- `fheenv/contracts/fheENVRegistry.sol`
- `fheenv/core/src/contracts.ts` (ABI + `addRotator`, `removeRotator`, `isRotator` helpers)
- `fheenv/cli/src/lib/contracts-node.ts` (re-export shim updated)
- `fheenv/cli/src/index.ts`

**Files created:**

- `fheenv/cli/src/commands/rotator.ts`

- [x] Add `rotators` mapping to contract
- [x] Add `onlyProjectOwnerOrRotator` modifier
- [x] Add `addRotator()` / `removeRotator()` (owner-only)
- [x] Add `RotatorGranted` / `RotatorRevoked` events
- [x] `updateEnvironment()` and `batchGrantAccess()` accept Rotator callers
- [x] `revokeAccess()`, `grantAccess()`, `addOwner()`, `transferOwnership()` remain owner-only
- [x] ABI + helpers in `@fheenv/core`
- [x] `fheenv rotator add / remove` CLI commands
- [x] 11 new contract tests (35–45), all passing

---

### Phase 3 — Auto-Trigger Rotation on `team remove` + IPFS Unpin ✅

**Why:** Primary CC6.3 control. `team-remove.ts` stopped at `revokeAccess()` + warning banner; the removed member retained FHE decrypt access until a human remembered to rotate. This phase makes rotation the default.

**Key constraint (spec §4.2):** If `revokeAccess()` succeeds but rotation fails, surface loudly — partial failure means CC6.3 is not met.

**Files modified:**

- `fheenv/cli/src/commands/team-remove.ts` — full rewrite with auto-rotate + unpin
- `fheenv/cli/src/lib/config.ts` — added `RotationPolicyEntry` (`expireInDays`, `graceMinutes`) and `rotationPolicy` to `FheEnvConfig`
- `fheenv/cli/src/index.ts` — `team remove` gains `--no-rotate` and `--file` options

- [x] `team-remove.ts`: after `revokeAccess()`, call `rotateEnvironment()` with `excludeMembers: [revokedMember]`
- [x] Partial failure surfaces as a `PARTIAL FAILURE` banner with exact retry command
- [x] `--no-rotate` escape hatch with prominent warning
- [x] `unpinFromIPFSNode(previousCid)` attempted after rotation confirms
- [x] Full `key_rotated` audit event with `triggerSource`, `removedMember`, `previousCid`, `newCid`, `unpinStatus`
- [x] `RotationPolicyEntry` added to config (`expireInDays`, `graceMinutes` — no `cronSchedule`, schedule lives in the GitHub Actions workflow YAML)

---

### Phase 4 — Scheduled Rotation Worker (GitHub Actions Cron)

**Why:** CC6.3 also requires time-based rotation independent of team changes. 90-day max cadence is the common SOC 2 auditor expectation.

**Implementation (spec §4.1):** GitHub Actions scheduled workflow — no persistent server, Actions run logs are a first-order audit artifact.

**Files to modify:**

- `fheenv/cli/src/lib/config.ts` — `rotationPolicy` already added in Phase 3 (`expireInDays`, `graceMinutes`)
- `fheenv/cli/src/index.ts`

**Files to create:**

- `fheenv/cli/src/commands/rotate-check.ts`
- `.github/workflows/rotate-scheduled.yml`

**Tasks:**

- [ ] Create `cli/src/commands/rotate-check.ts` — reads `rotationPolicy` from `.fheenv.json`, calls `getEnvironment()` to read `updatedAt` for each configured env, rotates if `now - updatedAt > (expireInDays - graceMinutes/1440) * 86400`; passes `triggerSource: "scheduled"` to audit; exits with code 1 and logs error if any rotation fails (so Actions marks the run as failed)
- [ ] Register `fheenv rotate-check` in `cli/src/index.ts`
- [ ] Create `.github/workflows/rotate-scheduled.yml` with `schedule` trigger, `workflow_dispatch`, checkout → install fheenv CLI → `fheenv rotate-check` → failure notification via `FHEENV_NOTIFY_WEBHOOK` secret
- [ ] Secrets used: `FHEENV_PRIVATE_KEY` (Rotator key), `FHEENV_PINATA_JWT`, `FHEENV_NOTIFY_WEBHOOK` (optional)

---

### Phase 5 — Audit Evidence Indexer + Frontend Dashboard

**Why:** On-chain events are tamper-evident but not auditor-friendly. An aggregated, exportable log with rotation history and overdue warnings is what the auditor actually reviews. Start collecting early.

**Files to create:**

- `fheenv/scripts/index-audit.ts`
- `fheenv/scripts/export-audit.ts`
- `fheenv/frontend/app/(app)/project/[id]/audit/page.tsx`

**Files to modify:**

- `fheenv/frontend/app/(app)/project/[id]/env/[env]/page.tsx`

**Tasks:**

- [ ] Create `scripts/index-audit.ts` — reads `AccessGranted`, `AccessRevoked`, `EnvironmentUpdated`, `RotatorGranted`, `RotatorRevoked` events from chain; writes JSONL to `~/.fheenv/audit.log`; deduplicates by `txHash`
- [ ] Create `scripts/export-audit.ts` — reads `~/.fheenv/audit.log`, converts to CSV with headers matching spec §4.6 evidence table; accepts `--from` / `--to` date flags
- [ ] Create `frontend/app/(app)/project/[id]/audit/page.tsx` — per-project rotation history: `EnvironmentUpdated` events table, last rotation date per env, red overdue badge if `now - updatedAt > expireInDays * 86400`
- [ ] `frontend/app/(app)/project/[id]/env/[env]/page.tsx` — add "Last rotated" timestamp from `updatedAt`; amber warning if older than 90 days

---

---

## Resolved Finding — Rotator Key Custody (F-01)

The Rotator key custody is securely handled via GitHub Actions Secrets (`FHEENV_PRIVATE_KEY` / `FHEENV_ROTATOR_KEY`) rather than a complex Lit Protocol setup.
This provides a native, low-friction integration where automation is gated strictly by GitHub repository permissions. The Rotator role guarantees least privilege by ensuring this key can only rotate keys and cannot manage users.

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
