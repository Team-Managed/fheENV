import fs from "fs";
import path from "path";
import chalk from "chalk";
import { exportAuditRecords } from "../lib/audit";

export interface ExportAuditOptions {
  output?: string;
  from?: string;
  to?: string;
}

export function exportAuditCommand(opts: ExportAuditOptions = {}): void {
  const csv = exportAuditRecords(undefined, opts.from, opts.to);
  if (!opts.output) {
    process.stdout.write(csv);
    return;
  }

  const outputPath = path.resolve(process.cwd(), opts.output);
  fs.writeFileSync(outputPath, csv, { encoding: "utf8", mode: 0o600 });
  console.error(chalk.green(`Local audit records exported to ${outputPath}`));
}
