import chalk from "chalk";
import { disableAnalytics, enableAnalytics, getAnalyticsStatus } from "../lib/analytics";

export type AnalyticsAction = "enable" | "disable" | "status";

export function analyticsCommand(action: AnalyticsAction): void {
  if (action === "enable") {
    enableAnalytics();
    console.log(chalk.green("✓ Anonymous CLI analytics enabled."));
    console.log(
      chalk.dim("  No wallet, project, environment, CID, transaction, or error data is sent."),
    );
    return;
  }
  if (action === "disable") {
    disableAnalytics();
    console.log(chalk.green("✓ CLI analytics disabled and the anonymous identifier was removed."));
    return;
  }

  const status = getAnalyticsStatus();
  console.log(
    status.enabled ? chalk.green("CLI analytics: enabled") : chalk.dim("CLI analytics: disabled"),
  );
}
