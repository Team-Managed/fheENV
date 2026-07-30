import fs from "fs";
import os from "os";
import path from "path";

export type AuditAction =
  | "member_revoked"
  | "rotation_completed"
  | "rotation_failed"
  | "rotation_skipped";

export interface AuditEvent {
  timestamp?: string;
  action: AuditAction;
  projectId: string;
  environment: string;
  target?: string;
  previousVersion?: string;
  newVersion?: string;
  transactionHash?: string;
  status: "success" | "failed" | "partial" | "skipped";
  trigger: "manual" | "team_remove";
}

const AUDIT_HEADERS: (keyof AuditEvent)[] = [
  "timestamp",
  "action",
  "projectId",
  "environment",
  "target",
  "previousVersion",
  "newVersion",
  "transactionHash",
  "status",
  "trigger",
];

export const DEFAULT_AUDIT_PATH = path.join(os.homedir(), ".fheenv", "audit.log");

export function appendAuditEvent(
  event: AuditEvent,
  logPath = DEFAULT_AUDIT_PATH,
): void {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
    const record = { ...event, timestamp: event.timestamp ?? new Date().toISOString() };
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.chmodSync(logPath, 0o600);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to write local audit record: ${message}`);
  }
}

export function toCsvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function parseDate(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error(`Invalid ${label} date: ${value}`);
  return timestamp;
}

export function exportAuditRecords(
  logPath = DEFAULT_AUDIT_PATH,
  from?: string,
  to?: string,
): string {
  if (!fs.existsSync(logPath)) throw new Error(`No local audit log found at ${logPath}.`);
  const fromTimestamp = parseDate(from, "from");
  const toTimestamp = parseDate(to, "to");
  const records = fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as AuditEvent;
      } catch {
        throw new Error(`Invalid JSON in local audit log at line ${index + 1}.`);
      }
    })
    .filter((record) => {
      const timestamp = Date.parse(record.timestamp ?? "");
      if (Number.isNaN(timestamp)) {
        throw new Error("Local audit record has an invalid timestamp.");
      }
      return (
        (fromTimestamp === undefined || timestamp >= fromTimestamp) &&
        (toTimestamp === undefined || timestamp <= toTimestamp)
      );
    })
    .sort((a, b) => Date.parse(a.timestamp ?? "") - Date.parse(b.timestamp ?? ""));

  const rows = [
    AUDIT_HEADERS.join(","),
    ...records.map((record) => AUDIT_HEADERS.map((header) => toCsvCell(record[header])).join(",")),
  ];
  return `${rows.join("\n")}\n`;
}
