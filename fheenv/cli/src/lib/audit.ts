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
