# Access Control & Key Rotation Policy — fheENV

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Policy Owner**   | Kunal Shah, Tyra Javed                                                   |
| **Approver(s)**    | Kunal Shah, Tyra Javed                                                   |
| **Version**        | 0.2                                                                      |
| **Effective Date** | 2026-07-08                                                               |
| **Review Cycle**   | Annual, or upon material system change                                   |
| **Audit Target**   | SOC 2 Type I — [target date TBD], Type II — observation period to follow |
| **Companion doc**  | `docs/specs/fheenv-key-rotation-soc2-spec.md`                            |

> ⚠️ **Auditor note:** the control-to-criteria mapping in §6 aligns with the AICPA's published Trust Services Criteria but CC6.2 vs. CC6.3 attribution varies across auditor firms. Confirm this mapping with your auditor before treating it as final. This document is not a substitute for professional auditor or compliance guidance.

---

## 1. Purpose

This policy defines how fheENV provisions, modifies, revokes, and rotates cryptographic access to encrypted `.env` secrets, and how evidence of these actions is retained for audit purposes.

This design was benchmarked against published industry practice — specifically [Agoda's automated key rotation service](https://medium.com/agoda-engineering/data-security-at-agoda-how-we-automate-encryption-key-rotation-e7ae37ea7885) — and adapted where fheENV's threat model differs. The companion architecture spec §8 documents the full comparison and the specific points where that reference pattern was deliberately not followed.

---

## 2. Scope

Applies to:

- All fheENV projects and environments (`development`, `staging`, `production`, or equivalent)
- All team members with FHE-decrypt access to any environment
- Any automated service account that performs rotation on the system's behalf

**Out of scope:** Physical security (no physical facilities — fheENV is a client/CLI/smart-contract system); availability/uptime commitments (Sepolia and IPFS/Pinata are third-party infrastructure outside fheENV's operational control).

---

## 3. Definitions

| Term                | Meaning                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Revocation**      | Marking a team member inactive on-chain (`revokeAccess()`). Logistic only — does not by itself prevent decryption of previously issued ciphertext handles.                                                                                                                    |
| **Rotation**        | Generating a new AES-256-GCM key, re-encrypting the environment, publishing a new IPFS blob, and re-issuing FHE access (`updateEnvironment()` + `batchGrantAccess()`) to currently active members only. This is the action that makes revocation cryptographically effective. |
| **Rotator key**     | A wallet key, distinct from any team member's or administrator's key, authorized only to execute rotation — not to add, remove, or modify team membership. Held in a Lit Protocol TEE; never stored as a plaintext credential.                                                |
| **Evidence record** | A logged entry capturing who/what triggered a rotation or revocation, when, for which environment, and the resulting outcome. Stored in `~/.fheenv/audit.log` (JSONL) and supplemented by GitHub Actions run logs.                                                            |

---

## 4. Policy Statements

Each statement is marked with its current implementation status and the date it reached operating status.

### 4.1 Access Provisioning

Access to decrypt an environment's secrets is granted only via `fheenv team add`, requiring an authenticated, authorized signer. No default or standing access exists for any environment beyond explicitly granted members. Time-limited grants are supported for CI/CD service accounts via `--expires`.

**Status: Implemented & operating** — 2026-07-08

---

### 4.2 Access Revocation

When a team member's access is no longer authorized, the entity revokes their on-chain grant (`fheenv team remove` / `revokeAccess()`) without undue delay. Revocation alone is logistic — it does not cryptographically prevent decryption of the existing ciphertext handles. See §4.3 for the control that makes revocation effective.

**Status: Implemented & operating** — 2026-07-08

---

### 4.3 Rotation Follows Revocation — Automatic

Revocation of a team member's access automatically triggers rotation of the affected environment's encryption key within the same operation, without requiring a separate manual step. The removed member is explicitly excluded from `batchGrantAccess()` on the new handles. If `revokeAccess()` succeeds but the follow-on rotation fails (network error, Pinata outage), the partial-failure state is surfaced loudly with an explicit retry instruction — it is not silently swallowed.

A `--no-rotate` escape hatch is provided for batch operations (removing multiple members before rotating once at the end); its use is logged and treated as an exception per §7.

**Status: Implemented & operating** — 2026-07-08

---

### 4.4 Scheduled Rotation

Every environment configured with a `rotationPolicy` entry in `.fheenv.json` is rotated automatically on a fixed per-environment schedule not exceeding 90 days, independent of any team membership change. The rotation attempt begins a configurable buffer (`graceMinutes`) before the scheduled deadline — following the Agoda pattern of treating the deadline as a hard expiry rather than a trigger point — so a failed first attempt has runway to retry. Any failure exits with a non-zero status code, causing the GitHub Actions workflow to be marked as failed and triggering a notification.

**Status: Implemented & operating** — 2026-07-08

---

### 4.5 Least-Privilege Automation Credential

Any credential authorized to perform automated rotation is scoped, via contract-level role restriction (`Rotator` role on `fheENVRegistry.sol`), to rotation functions only (`updateEnvironment()`, `batchGrantAccess()`). It is explicitly denied team-management and ownership functions (`revokeAccess()`, `addOwner()`, ownership transfer).

The Rotator signing key is held in the Lit Protocol Chipotle TEE and derived from the IPFS CID of the rotation action code — it never exists as a plaintext secret in any store. Access is gated by a GitHub OIDC JWT: only the specific repository and workflow file that match the content-addressed action are permitted to invoke signing. No `FHEENV_ROTATOR_KEY` secret is stored in GitHub Actions.

**Important caveat (retained from architecture spec §4.5):** function-selector restriction alone does not make the Rotator credential low-value. To rotate autonomously, the Rotator key must hold live FHE-decrypt access to every environment it rotates. Policy documentation acknowledges this explicitly: the Rotator is simultaneously (a) restricted from team-management functions, and (b) a standing credential with decrypt access to all secrets in scope. Both facts are stated rather than only the flattering one.

**Status: Implemented & operating** — 2026-07-08

---

### 4.6 Superseded Ciphertext Cleanup

Upon confirmed rotation, the previous IPFS blob is unpinned from fheENV-controlled Pinata infrastructure immediately after `updateEnvironment()` confirms on-chain. For scheduled rotation, the unpin is delayed by `graceMinutes` to protect in-flight `fheenv pull` operations — this window exists solely for operational safety, not as a continuity window for any removed party. Unpin failures are logged with the previous CID so they can be retried.

fheENV acknowledges and discloses that unpinning removes its own pin but does not guarantee the blob is unreachable everywhere — IPFS content may be replicated by any node that fetched it while pinned. This is weaker than a private-store hard-delete (e.g., HashiCorp Vault) and is stated as a residual risk rather than a complete control.

**Status: Implemented & operating** — 2026-07-08

---

### 4.7 Incident-Triggered Rotation

In the event of suspected key compromise (lost device, leaked credential, suspicious on-chain activity), any authorized team member may trigger immediate manual rotation via `fheenv rotate` outside the normal schedule, without waiting for the next scheduled cycle.

**Status: Implemented & operating** — pre-existing capability; this statement formalizes it as policy.

---

### 4.8 Evidence Logging & Retention

Every rotation and revocation event — scheduled, triggered, or manual, via CLI — is logged with actor address (hashed for PostHog; raw in the local log), trigger source, environment, timestamp, transaction hash, previous and new IPFS CIDs, and unpin outcome. Records are written to `~/.fheenv/audit.log` (append-only JSONL, mode 0600).

The `fheenv index-audit` command indexes on-chain events into the same log; `fheenv export-audit` exports the log as a CSV for auditor review. GitHub Actions run logs for `rotate-scheduled.yml` serve as a durable, tamper-evident secondary artifact with timestamps that do not depend on the operator's local machine.

Log retention: the local JSONL log is retained for a minimum of 12 months on the operator's system. GitHub Actions run logs are retained per the repository's Actions log retention settings (default 90 days — increase to 400 days via repository settings for SOC 2 Type II coverage).

**Status: Implemented & operating** — 2026-07-08

---

### 4.9 Rotation Monitoring & Alerting

The status of scheduled rotation jobs is visible in a PostHog dashboard (events `fheenv_key_rotated` by `triggerSource = "scheduled"`, filtered per `projectId`). A webhook notification is sent to the configured `FHEENV_NOTIFY_WEBHOOK` on both successful completion and failure of every scheduled rotation run, so a silently broken automation job does not go unnoticed until audit time.

**Status: Implemented & operating** — 2026-07-08

---

## 5. Roles & Responsibilities

| Role                                      | Responsibility                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Policy Owner** (Kunal Shah, Tyra Javed) | Maintains this document; tracks implementation status against §4; reviews evidence records monthly                               |
| **Approvers** (Tyra Javed, Kunal Shah)    | Approve policy changes; confirm control status updates before audit submission                                                   |
| **Team members**                          | Hold individual wallet credentials via `fheenv login`; never share keys; report suspected compromise immediately (triggers §4.7) |
| **Rotator credential** (Lit Protocol TEE) | Executes §4.3 and §4.4; holds no team-management or ownership privilege (§4.5); key never leaves the TEE                         |

---

## 6. Control-to-Criteria Mapping

| Policy statement                           | Primary SOC 2 criterion                                                                | Rationale                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| §4.1 Access Provisioning                   | **CC6.1** — logical access restricted to authorized users                              | No credential without explicit `team add`                                                                                          |
| §4.2 Access Revocation                     | **CC6.3** — access removed in a timely manner when no longer needed                    | Direct match: revocation is the logistic removal step                                                                              |
| §4.3 Rotation Follows Revocation           | **CC6.3** — primary control                                                            | This is the control that closes the gap between "marked inactive" and "cannot actually decrypt"; §4.2 alone does not satisfy CC6.3 |
| §4.4 Scheduled Rotation                    | **CC6.1** — key management practices                                                   | Not tied to a specific access event; general key-hygiene and exposure-window control                                               |
| §4.5 Least-Privilege Automation Credential | **CC6.1** — credentials managed with least privilege                                   | Direct match: function-selector restriction + TEE-backed key with no stored plaintext                                              |
| §4.6 Ciphertext Cleanup                    | **CC6.1** — protecting information assets                                              | Supporting control; reduces residual exposure window after rotation                                                                |
| §4.7 Incident-Triggered Rotation           | **CC7.3** — security events evaluated and responded to                                 | Direct match: manual rotation is the response capability for key compromise events                                                 |
| §4.8 Evidence Logging                      | **CC7.2** — monitors system components; also supports auditability of all CC6 controls | Without this, none of the above controls are demonstrable to an auditor even if they are operating correctly                       |
| §4.9 Rotation Monitoring & Alerting        | **CC7.2** — monitors system components for anomalies                                   | Direct match: operational visibility, distinct from the evidence _record_ in §4.8                                                  |

---

## 7. Exceptions

Any deviation from this policy (e.g., a delayed rotation due to infrastructure outage, use of `--no-rotate` for a batch operation) must be logged in the evidence record (§4.8) with a stated reason. Undocumented deviations are treated as control failures for audit purposes.

---

## 8. Monitoring & Review

- Evidence records (§4.8) are reviewed **monthly** by the Policy Owner for completeness — specifically, that no gap exists between a `member_revoked` event and a corresponding `key_rotated` event for the same environment.
- This policy is reviewed **annually** or upon any material change to the rotation architecture (e.g., migrating off Sepolia, changing the FHE provider, modifying the Rotator role scope).

---

## 9. Revision History

| Version | Date       | Change        | Author                 |
| ------- | ---------- | ------------- | ---------------------- |
| 0.1     | 2026-07-08 | Initial draft | Kunal Shah, Tyra Javed |
