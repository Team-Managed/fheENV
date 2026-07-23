# fheENV Automated Key Rotation — Architecture & SOC 2 Control Spec

**Status:** Proposed
**Date:** July 8, 2026
**Deciders:** Tyra KJ, Kunal Shah
**Repo:** Team-Managed/fheENV
**Target audit:** SOC 2 Type — Security (Common Criteria), access control domain

---

## 1. Purpose & Scope

fheENV currently supports key rotation as a **manual, event-driven** operation (`fheenv rotate`). This is cryptographically correct but operationally insufficient for SOC 2: an auditor testing CC6.3 ("access is removed in a timely manner") will ask for evidence that revocation _always_ happens, not that a CLI _warned someone to remember to_.

This spec covers:

1. Scheduled rotation (time-based, independent of any human trigger)
2. Auto-triggered rotation on `fheenv team remove` (currently warn-only)
3. IPFS blob lifecycle management — unpinning superseded ciphertext
4. An audit evidence layer built on top of existing on-chain events
5. Custody model for the credential that performs automated rotation

---

## 2. Current State (baseline)

| Trigger                                                  | Mechanism                                                                                                                                                         | Gap                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `fheenv team remove` (`cli/src/commands/team-remove.ts`) | Calls `revokeAccess()` on `fheENVRegistry.sol`, which sets `members[projectId][envHash][member] = false` and emits `AccessRevoked` — then prints a warning banner | No automatic follow-through — pure human reliance                           |
| `fheenv rotate` / `fheenv push`                          | User-invoked; calls `updateEnvironment()` (new AES key, new IPFS CID, new FHE handles) then `batchGrantAccess()` for active members                               | No scheduling, no trigger from `revokeAccess()`                             |
| IPFS blob versions                                       | Old blob (`blob_v1`) is never referenced again on-chain after `updateEnvironment()`                                                                               | Not explicitly unpinned — may still be fetchable/pinned                     |
| Audit trail                                              | Web dashboard reads on-chain `AccessGranted`/`AccessRevoked`/`updateEnvironment` events                                                                           | Usable as raw evidence, but not aggregated, exported, or retained off-chain |
| Automation credential                                    | None exists                                                                                                                                                       | No key custody model defined for a service that would act autonomously      |

**Important architectural fact:** `revokeAccess()` and `updateEnvironment()`/`batchGrantAccess()` are three independent contract calls with no relationship enforced on-chain. The contract itself documents this: CoFHE has no `revokeAllow` primitive, so revocation is logistic (a boolean flip) rather than cryptographic — the removed member's FHE access to the _current_ ciphertext handles persists until those handles are replaced. Nothing on-chain can force "rotation follows revocation"; that sequencing has to be enforced in the orchestration layer (§4.2), which today is exactly where the CLI's and frontend's warning banners sit and do nothing more than warn.

The core cryptographic mechanism (AES-256-GCM + split FHE halves + `batchGrantAccess()`) is sound and does not need to change. This spec only adds **triggers**, **cleanup**, and **evidence** around it.

---

## 3. SOC 2 Trust Services Criteria Mapping

| Criterion | Requirement (paraphrased)                                                                   | How this spec satisfies it                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CC6.1** | Logical access is restricted via least-privilege, and credentials are managed appropriately | New scoped "Rotator" contract role (§4.5) — the automation key can call `updateEnvironment()`/`batchGrantAccess()` but cannot call `revokeAccess()`, `addMember()`, or any ownership function                                                                         |
| **CC6.2** | Access is authorized before it's granted                                                    | Unchanged — `team add` already requires signer authorization; not affected by this work                                                                                                                                                                               |
| **CC6.3** | Access is removed or modified in a timely manner when no longer needed                      | **Primary control.** Auto-trigger on `team remove` (§4.2) closes the gap where `revokeAccess()` (logistic revocation) was never followed by `updateEnvironment()`/`batchGrantAccess()` (cryptographic revocation) without a human remembering to run a second command |
| **CC7.2** | The entity monitors system components for anomalies                                         | Audit evidence layer (§4.6) — every rotation (scheduled, triggered, manual) is logged with actor, reason, and timestamp                                                                                                                                               |
| **CC7.3** | Security events are evaluated and responded to                                              | Scheduled rotation + old-blob unpinning (§4.4) reduces the window in which a compromised or former credential remains useful                                                                                                                                          |

CC6.3 is the control an auditor will press hardest on, since it's the one currently unmet — everything else here is either already satisfied or a supporting artifact.

---

## 4. Target Architecture

### 4.1 Scheduled Rotation Service

A standalone worker process (not part of the CLI binary) that rotates every environment on a fixed cadence, independent of team changes. This design is modeled on the config-driven cron pattern [Agoda's key rotation service uses](https://medium.com/agoda-engineering/data-security-at-agoda-how-we-automate-encryption-key-rotation-e7ae37ea7885) for rotating secrets — checking expiry on each scheduled run rather than hardcoding rotation logic per key.

- **Cadence:** 90 days default, configurable **per-environment** via `.fheenv.json`. Rather than a single flat `rotationIntervalDays`, structure it as a per-environment config block so each environment can carry its own policy — directly parallel to Agoda's per-key config (`cron-schedule`, `expire-in-days`, `algorithm`, `key-size` per secret):

  ```json
  "rotationPolicy": {
    "production":  { "cronSchedule": "0 3 * * 0", "expireInDays": 30, "graceMinutes": 15 },
    "staging":     { "cronSchedule": "0 3 1 * *", "expireInDays": 90, "graceMinutes": 15 }
  }
  ```

  90 days aligns with common SOC 2 auditor expectations for credential/key rotation; tighten to 30 for `production` if you want a stronger posture — cost is one more IPFS upload + one more chain tx per cycle.

- **Implementation:** Node cron worker (`node-cron`) or a GitHub Actions scheduled workflow if you'd rather not run a persistent process. Given fheENV has no existing server infra, a scheduled GitHub Action calling the CLI in CI mode (`FHEENV_PRIVATE_KEY` from Actions secrets) is the lower-lift option — no new hosting, and Actions run logs double as a first evidence artifact.
- **Failure handling:** If a scheduled rotation fails (RPC down, Pinata rate limit, etc.), it must alert (not silently skip) and retry with backoff. Agoda's service handles this with a `grace-period` config value — it starts attempting the new key generation _before_ the actual expiration date, so a failed first attempt still has runway to retry before anything is actually stale. Adopt the same idea: treat `expireInDays` as a deadline, not a trigger point, and start the rotation attempt a configurable buffer before it. A missed rotation with no record of the miss is worse for audit purposes than no automation at all.
- **Notification:** on completion (success or failure), send a notification (email or a webhook into wherever your team already gets alerts) — Agoda notifies on rotation completion for exactly this reason: someone needs to know it happened without having to go check.

### 4.2 Event-Triggered Rotation on `team remove`

Change both entry points — `cli/src/commands/team-remove.ts` and `TeamManager.tsx`'s `handleRevoke()` — from "warn and stop" to "revoke, then automatically invoke the rotation flow." Both currently call `revokeAccess()` and then only print/render a warning; the fix is inserting a real call where that warning currently sits.

```
team-remove.ts / TeamManager.tsx handleRevoke()
      │
      ▼
  revokeAccess() on fheENVRegistry.sol
      └─ members[projectId][envHash][member] = false
      └─ emit AccessRevoked  (existing behavior — logistic revocation only)
      │
      ▼
  Auto-invoke shared rotation flow (extracted to @fheenv/core, §4.3):
      ├─ updateEnvironment(projectId, envName, newEncHigh, newEncLow, newCid, version+1)
      │      └─ new AES key, new IPFS blob_v2, new FHE handles
      └─ batchGrantAccess() for remaining active members only
      │
      ▼
  Old blob_v1 queued for unpinning (§4.4)
      │
      ▼
  Evidence record written (§4.6): actor, removed member, env, timestamp, tx hashes for both revokeAccess() and updateEnvironment()
```

Keep a `--no-rotate` escape hatch for edge cases (e.g., batch-removing 5 members and rotating once at the end instead of 5 times), but make the auto-invoke the default so the safe path requires no extra step. Since `revokeAccess()` and `updateEnvironment()` are separate transactions rather than one atomic call, handle the case where `revokeAccess()` succeeds but the follow-on rotation fails (network blip, Pinata error): the member is logistically revoked but not yet cryptographically locked out. This partial-failure state needs to surface loudly (not just log silently) and retry, since it's the exact CC6.3 gap this feature exists to close.

**Where the Agoda pattern does _not_ transfer:** Agoda's service retains a "Previous Key" for a grace period specifically so a sender who's still mid-flight with the old key doesn't get locked out — that's a continuity feature. Applying the same idea to _revocation_-triggered rotation would be the wrong lesson to take from the reference: the removed member is the one party who should never benefit from a grace window. Any grace period on the unpin step here (§4.4) exists purely as an internal operational safety margin for in-flight legitimate processes — not as intentional continued access for the person just removed.

### 4.4 IPFS Blob Lifecycle

On successful rotation, unpin the prior CID via the Pinata API (`DELETE /pinning/unpin/{cid}`) once the new blob is confirmed live on-chain — never unpin before the new version is committed, to avoid a gap where neither version is available.

- **Grace window before unpin, correctly scoped:** wait a short, configurable buffer (the `graceMinutes` field in §4.1's config — default 15 minutes, not days) after `updateEnvironment()` confirms before unpinning `blob_v1`. This mirrors Agoda's grace-period concept in _purpose_ (protect against something failing mid-transition) but not in _duration or intent_ — Agoda's grace period exists so a legitimate third party can keep decrypting with the old key for a while; fheENV's exists only so an `fheenv pull` that started microseconds before rotation completed doesn't fail mid-fetch. Minutes, not days — and for team-removal-triggered rotation specifically, keep this window as short as your infra reliably allows, since the removed member is exactly who this window should not benefit.
- Add a `previousCid` reference (off-chain, in the evidence log — not on-chain, no need to pay gas for it) so unpin failures can be retried.
- Note the residual risk honestly in your audit narrative: unpinning removes fheENV's copy from Pinata, but IPFS content can be replicated by anyone who fetched it while it was pinned. This control reduces exposure; it does not guarantee the old blob is unreachable everywhere. That caveat is better stated proactively in your SOC 2 narrative than discovered by the auditor. Agoda's model sidesteps this entirely by permanently deleting the old key from Vault — a private, single-owner store. fheENV's equivalent "Previous Key" (the old FHE handles) can't be deleted at all, because CoFHE's ACL is append-only; unpinning IPFS is the closest available control, and it's weaker than Vault's hard delete. Say so plainly rather than implying parity with a system that has a real delete primitive.

### 4.5 Rotation Automation Key Custody — new contract role

This is the part most likely to be missed, and it's the one worth getting right before the audit rather than after: **the credential that runs scheduled rotation is now a standing, unattended, high-value key.** If it uses the same admin/owner key as `team add`/`team remove`, you've built a single credential capable of adding members, removing members, and rotating — which is a worse concentration of privilege than the manual process it replaces, and directly undercuts the CC6.1 least-privilege argument.

Recommended: add a `Rotator` role to `fheENVRegistry.sol`, separate from the project owner/admin role, scoped via a modifier so a `Rotator`-role key can call `updateEnvironment()` and `batchGrantAccess()` but is explicitly denied `revokeAccess()`, `addMember()`, and any ownership-transfer function. This is a meaningful split: `revokeAccess()` and `updateEnvironment()`/`batchGrantAccess()` are already separate functions in the current contract (confirmed in `team-remove.ts`'s two-step flow), so gating by function selector rather than by a single "rotate" entry point is straightforward — no new consolidated function needs to be added to the contract for this to work. The scheduler and CI use a Rotator key; humans keep using their own wallets for team management via `fheenv login`.

**Correction to the least-privilege framing above:** function-selector restriction alone does not make the Rotator credential low-value, and it's important not to let this document imply otherwise. Rotation re-encrypts the environment's _actual current content_ with a new key — per the CLI's own documented behavior, `rotate` re-encrypts the local `.env` file. A human running it manually already has that plaintext open locally. An **unattended** rotation service does not. To rotate content it wasn't just handed by a human, the Rotator service must first decrypt the existing ciphertext itself — which means it needs to be `batchGrantAccess`-included as an active FHE-decrypt member of every environment it rotates, not merely permitted to call two contract functions. So the Rotator credential is simultaneously: (a) restricted from team-management and ownership functions (the least-privilege win this section originally described), and (b) a standing credential with live decrypt access to every secret in scope — which is not a narrow, low-value credential at all. Both things are true, and the policy documentation should state both rather than only the flattering half.

Practical consequence: KMS-backed signing (or an HSM-backed one) is not a "natural follow-up hardening step" — given (b), it should be treated as a Phase 2 requirement, not deferred past the audit. A GitHub Actions encrypted secret is reasonable custody for a CI credential scoped to _decrypt only_ (see §4.7), but is a materially weaker choice for a credential that also holds _rewrite_ power over the ciphertext itself. If timeline forces a tradeoff, the acceptable compromise is: Actions-secret custody is fine to ship Phase 2 with, **provided** the Rotator key is still denied team-management/ownership functions (the part that's cheap and already planned) and the KMS migration is tracked as a dated, disclosed remediation item rather than silently left open (see Finding F-01 in §7).

### 4.6 Audit Evidence Layer

On-chain events already give you tamper-evident _what happened_. What's missing is an aggregated, exportable, human-readable _record_ an auditor can review without querying Sepolia directly.

Minimum viable: a lightweight indexer (can be a scheduled job, doesn't need to be real-time) that reads `AccessGranted`, `AccessRevoked`, and rotation events and writes them to an append-only log (flat file in a private repo, or a simple database table) with:

| Field                          | Example                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| Timestamp                      | 2026-07-08T14:32:00Z                                              |
| Event type                     | `rotation_triggered`                                              |
| Trigger source                 | `team_remove` \| `scheduled` \| `manual_cli` \| `manual_frontend` |
| Actor address                  | 0x...                                                             |
| Environment                    | production                                                        |
| Removed member (if applicable) | 0x...                                                             |
| Old CID / new CID              | Qm... / Qm...                                                     |
| Tx hash                        | 0x...                                                             |
| Unpin status                   | success \| pending \| failed                                      |

This table _is_ your CC6.3 and CC7.2 evidence. Export it as CSV/PDF when the audit window opens.

**Visibility layer:** Agoda pairs its rotation service with a Grafana dashboard showing each key's expiration date, job status, and alerts when something fails — visibility into the _service_, not just a log of past events. fheENV's web dashboard already has the pieces for a lightweight equivalent: extend the existing on-chain event view to show, per environment, last rotation date, next scheduled rotation, and a visible warning if a scheduled rotation is overdue (i.e., past `expireInDays` + `graceMinutes` with no corresponding evidence record). This doesn't need to be Grafana — a page in the existing frontend that reads the evidence log is enough, and it's useful outside the audit too, since it's the fastest way for you or Kunal to notice a silently broken cron job.

---

## 5. Rotation Policy (for your SOC 2 policy documentation)

State this explicitly in whatever policy doc you hand the auditor — a control without a written policy statement is treated as informal/undocumented even if the code enforces it:

- Secrets are re-encrypted and access re-issued **automatically** within [target: same rotation cycle, e.g., immediately] of a team member's removal.
- All environments are rotated on a fixed schedule not exceeding 90 days, regardless of team changes.
- Superseded ciphertext (IPFS blobs) is unpinned from fheENV-controlled infrastructure upon confirmed rotation.
- The credential authorized to perform automated rotation holds no other privileges (team management, fund custody, ownership transfer).
- Every rotation event, its trigger, and its outcome are logged and retained for [retention period, typically ≥1 year for SOC 2].

---

## 6. Implementation Phases

| Phase | Delivers                                                | Why this order                                                                                                                                                   |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Extract shared `@fheenv/core` rotation library from CLI | Everything else depends on one source of truth for rotation logic                                                                                                |
| **2** | Rotator contract role + scoped key                      | Must exist before anything automated is allowed to sign transactions                                                                                             |
| **3** | Auto-trigger on `team remove` + IPFS unpin              | Closes the CC6.3 gap — highest audit priority                                                                                                                    |
| **4** | Scheduled rotation worker (GitHub Actions cron)         | Second-order control; strengthens the story but CC6.3 is already met after Phase 3                                                                               |
| **5** | Audit evidence indexer + export                         | Needed before the audit date regardless of when engineering finishes — evidence needs a few rotation cycles of history to be credible, so start collecting early |

Given a real audit date, **Phases 1–3 and 5 are the ones to prioritize**; Phase 4 matters for completeness but won't be what an auditor tests first.

---

## 8. Benchmark: Agoda's Key Rotation Service

For reference, this design was checked against [Agoda's published key rotation service](https://medium.com/agoda-engineering/data-security-at-agoda-how-we-automate-encryption-key-rotation-e7ae37ea7885) — a config-driven cron service rotating secrets in HashiCorp Vault for data-in-transit encryption. Worth citing in your audit narrative as evidence this design follows an established industry pattern rather than something invented ad hoc for the audit.

| Agoda's pattern                                                                           | fheENV equivalent                                                                                                                                           | Adopted as-is?                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config-driven cron per secret (`cron-schedule`, `expire-in-days`, `algorithm`)            | Per-environment `rotationPolicy` block in `.fheenv.json` (§4.1)                                                                                             | Yes                                                                                                                                                                                                                                                                                                                  |
| Grace period before expiry, to allow retry                                                | `graceMinutes` as a pre-expiry retry buffer (§4.1)                                                                                                          | Yes, same purpose                                                                                                                                                                                                                                                                                                    |
| "Previous Key" retained for a grace period so senders using the old key aren't locked out | —                                                                                                                                                           | **No — deliberately not adopted.** fheENV's rotation is often revocation-driven; retaining old access for a "grace period" would directly undermine CC6.3. Where a grace window exists (§4.4's unpin buffer), it protects in-flight _legitimate_ processes for minutes, not the removed party for any period at all. |
| Old key permanently deleted from Vault after grace period                                 | Old CID unpinned from Pinata (§4.4)                                                                                                                         | Partially — Pinata unpinning is the closest available control, but it's weaker than Vault's hard delete since IPFS content can persist elsewhere once replicated. Disclosed as a residual risk rather than presented as equivalent.                                                                                  |
| Grafana dashboard: expiration dates, job status, failure alerts                           | Extend existing web dashboard to show last/next rotation and overdue warnings (§4.6)                                                                        | Yes                                                                                                                                                                                                                                                                                                                  |
| Email notification on rotation                                                            | Notification (email/webhook) on scheduled rotation completion or failure (§4.1)                                                                             | Yes                                                                                                                                                                                                                                                                                                                  |
| Secrets stored in HashiCorp Vault (centralized, access-controlled store)                  | Secrets exist as FHE-encrypted handles on-chain + AES-encrypted blob on IPFS — no centralized store, that's the whole point of fheENV's "not even us" model | No — architecturally different by design, not a gap                                                                                                                                                                                                                                                                  |

---
