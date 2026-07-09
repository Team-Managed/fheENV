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
  format?: "csv" | "table";
}

function addr(a: string | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function cid(c: string | undefined): string {
  if (!c) return "—";
  return `${c.slice(0, 6)}…${c.slice(-4)}`;
}

function formatTable(records: (AuditEvent & Record<string, unknown>)[]): void {
  const EVENT_COLORS: Record<string, (s: string) => string> = {
    env_pushed: chalk.cyan,
    env_pulled: chalk.green,
    env_run: chalk.green,
    member_granted: chalk.blue,
    member_revoked: chalk.yellow,
    key_rotated: chalk.magenta,
    login: chalk.dim,
  };

  const COL = { time: 8, event: 16, actor: 12, env: 12, detail: 36 };
  const line = "─".repeat(COL.time + COL.event + COL.actor + COL.env + COL.detail + 10);

  const h = (s: string, w: number) => s.padEnd(w);
  console.log(
    chalk.bold(
      `${h("TIME", COL.time)}  ${h("EVENT", COL.event)}  ${h("ACTOR", COL.actor)}  ${h("ENV", COL.env)}  DETAIL`,
    ),
  );
  console.log(chalk.dim(line));

  for (const rec of records) {
    const time = rec.timestamp ? new Date(rec.timestamp).toISOString().slice(11, 19) : "—";
    const event = rec.action ?? "—";
    const color = EVENT_COLORS[event] ?? chalk.white;
    const actor = addr(rec.actor);
    const env = (rec.envName ?? "—").slice(0, COL.env - 1).padEnd(COL.env);

    let detail = "—";
    if (event === "member_granted") detail = `→ ${addr(rec.target as string | undefined)}`;
    else if (event === "member_revoked") detail = `✕ ${addr(rec.target as string | undefined)}`;
    else if (event === "key_rotated") {
      const trigger = rec.triggerSource ? ` [${rec.triggerSource}]` : "";
      const status =
        rec.unpinStatus === "success"
          ? chalk.green("✓ unpinned")
          : rec.unpinStatus === "failed"
            ? chalk.red("✗ unpin failed")
            : "";
      const newc = rec.newCid ? `→ ${cid(rec.newCid as string)}` : "";
      detail = `${newc}${trigger} ${status}`.trim();
    }

    console.log(
      `${chalk.dim(time)}  ${color(event.padEnd(COL.event))}  ${chalk.dim(actor.padEnd(COL.actor))}  ${env}  ${detail}`,
    );
  }

  console.log(chalk.dim(line));
  console.log(chalk.dim(`${records.length} record${records.length !== 1 ? "s" : ""}`));
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
  const allRecords: (AuditEvent & Record<string, unknown>)[] = [];

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
    allRecords.push(rec);
  }

  if (opts.format === "table") {
    formatTable(allRecords);
    return;
  }

  const rows: string[] = [HEADERS.join(",")];
  for (const rec of allRecords) rows.push(toCsvRow(rec));
  const csv = rows.join("\n") + "\n";

  if (opts.output) {
    const outPath = path.resolve(process.cwd(), opts.output);
    fs.writeFileSync(outPath, csv, "utf-8");
    console.error(
      chalk.green(
        `Exported ${allRecords.length} record${allRecords.length !== 1 ? "s" : ""} → ${outPath}`,
      ),
    );
  } else {
    process.stdout.write(csv);
    console.error(
      chalk.dim(`${allRecords.length} record${allRecords.length !== 1 ? "s" : ""} exported.`),
    );
  }
}
