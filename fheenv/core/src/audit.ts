/**
 * Structured audit log — SOC 2 CC7.2 (Monitor System Components)
 *
 * Appends JSONL records to ~/.fheenv/audit.log (mode 0600).
 * Every secret access, key rotation, and membership change is recorded.
 * Failures are silently swallowed so logging never disrupts normal operations.
 */
import fs from "fs";
import path from "path";
import os from "os";

const AUDIT_LOG_PATH = path.join(os.homedir(), ".fheenv", "audit.log");

export type AuditAction =
  | "login"
  | "env_pushed"
  | "env_pulled"
  | "env_run"
  | "key_rotated"
  | "member_granted"
  | "member_revoked";

export type RotationTrigger = "team_remove" | "scheduled" | "manual_cli" | "manual_frontend";

export interface AuditEvent {
  /** ISO 8601 timestamp — set automatically by logAuditEvent */
  timestamp?: string;
  /** Ethereum address of the wallet performing the action */
  actor: string;
  action: AuditAction;
  projectId?: string;
  envName?: string;
  /** For member_granted / member_revoked: the target address */
  target?: string;
  /** On-chain transaction hash confirming the action */
  txHash?: string;
  /** ISO 8601 expiry time for time-limited member_granted grants */
  expiresAt?: string;
  /** For key_rotated: what triggered the rotation */
  triggerSource?: RotationTrigger;
  /** For key_rotated: previous IPFS CID (for unpin tracking) */
  previousCid?: string;
  /** For key_rotated: new IPFS CID */
  newCid?: string;
  /** For key_rotated: unpin status of the previous blob */
  unpinStatus?: "success" | "pending" | "failed" | "not_attempted";
  /** For key_rotated: member removed that triggered this rotation */
  removedMember?: string;
}

export function logAuditEvent(event: AuditEvent): void {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const record = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
    fs.appendFileSync(AUDIT_LOG_PATH, record + "\n", { mode: 0o600 });
  } catch {
    // Never let audit logging break normal operations
  }
}
