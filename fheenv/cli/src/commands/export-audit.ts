/**
 * fheenv export-audit
 *
 * Exports ~/.fheenv/audit.log as a CSV that can be handed to a SOC 2
 * auditor as CC6.3 / CC7.2 evidence. Columns match the evidence table
 * in §4.6 of the key-rotation spec.
 *
 * Usage:
 *   fheenv export-audit                              # stdout
 *   fheenv export-audit --output audit-export.csv   # file
 *   fheenv export-audit --from 2026-01-01 --to 2026-07-08
 *
 * Tip: run `fheenv index-audit` first to pull in the latest on-chain events.
 */

import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import type { AuditEvent } from "@fheenv/core";

const LOG_PATH = path.join(os.homedir(), ".fheenv", "audit.log");

// ── CSV columns — match spec §4.6 evidence table ──────────────────────────────

const HEADERS = [
  "Timestamp",
  "Event type",
  "Trigger source",
  "Actor address",
  "Environment",
  "Removed member",
  "Old CID",
  "New CID",
  "Tx hash",
  "Unpin status",
  "Project ID",
  "Source",
];

function toCsvRow(rec: AuditEvent & Record<string, unknown>): string {
  const triggerSource = (rec.triggerSource as string | undefined) ?? "";
  const eventType =
    rec.action === "key_rotated"
      ? "rotation"
      : rec.action === "member_granted"
        ? "access_granted"
        : rec.action === "member_revoked"
          ? "access_revoked"
          : rec.action;

  const cells = [
    rec.timestamp ?? "",
    eventType,
    triggerSource,
    rec.actor ?? "",
    rec.envName ?? "",
    rec.removedMember ?? rec.target ?? "",
    (rec.previousCid as string | undefined) ?? "",
    (rec.newCid as string | undefined) ?? "",
    rec.txHash ?? "",
    (rec.unpinStatus as string | undefined) ?? "",
    rec.projectId ?? "",
    (rec.source as string | undefined) ?? "cli",
  ];

  return cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
}

export interface ExportAuditOptions {
  output?: string;
  from?: string; // ISO date string, e.g. "2026-01-01"
  to?: string;
}

export function exportAuditCommand(opts: ExportAuditOptions = {}): void {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(
      chalk.red(
        `No audit log found at ${LOG_PATH}.\n` +
          `Run \`fheenv index-audit\` first to pull on-chain events, or ` +
          `perform some CLI operations to generate log entries.`,
      ),
    );
    process.exit(1);
  }

  const fromMs = opts.from ? new Date(opts.from).getTime() : 0;
  const toMs = opts.to ? new Date(opts.to).getTime() : Infinity;

  const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n");
  const rows: string[] = [HEADERS.join(",")];
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: AuditEvent & Record<string, unknown>;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (rec.timestamp) {
      const ts = new Date(rec.timestamp).getTime();
      if (ts < fromMs || ts > toMs) continue;
    }

    rows.push(toCsvRow(rec));
    count++;
  }

  const csv = rows.join("\n") + "\n";

  if (opts.output) {
    const outPath = path.resolve(process.cwd(), opts.output);
    fs.writeFileSync(outPath, csv, "utf-8");
    console.error(chalk.green(`Exported ${count} record${count !== 1 ? "s" : ""} → ${outPath}`));
  } else {
    process.stdout.write(csv);
    console.error(chalk.dim(`${count} record${count !== 1 ? "s" : ""} exported.`));
  }
}
