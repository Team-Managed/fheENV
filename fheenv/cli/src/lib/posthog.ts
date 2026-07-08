/**
 * PostHog event capture for the fheENV CLI — visibility layer (§4.6).
 *
 * Fires server-side events to PostHog when POSTHOG_API_KEY is set.
 * All calls are fire-and-forget and never throw — PostHog must never
 * affect CLI correctness or block the process.
 *
 * Set these env vars to enable:
 *   POSTHOG_API_KEY   — your PostHog project API key
 *   POSTHOG_HOST      — optional; defaults to https://us.i.posthog.com
 *
 * Recommended PostHog dashboard:
 *   - Insight: `fheenv_key_rotated` filtered by `triggerSource`
 *   - Alert: `fheenv_key_rotated` not seen for project in >90 days → overdue
 *   - Funnel: `fheenv_member_revoked` → `fheenv_key_rotated` (CC6.3 gap detection)
 */

import type { AuditEvent } from "@fheenv/core";

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

function getClient(apiKey: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require("posthog-node") as typeof import("posthog-node");
  return new PostHog(apiKey, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
}

/**
 * Capture a rotation/access audit event.
 * distinctId is the projectId (public on-chain) — never a wallet address.
 */
export function capturePosthogEvent(event: AuditEvent): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return;

  void (async () => {
    try {
      const client = getClient(apiKey);

      await client.capture({
        // Use projectId (already public on-chain) as the stable identifier.
        // Wallet addresses are intentionally excluded — sending them to a
        // third-party analytics service would be PII-adjacent.
        distinctId: event.projectId ? `project-${event.projectId}` : "fheenv-system",
        event: `fheenv_${event.action}`,
        properties: {
          projectId: event.projectId,
          envName: event.envName,
          triggerSource: event.triggerSource,
          unpinStatus: event.unpinStatus,
          // CIDs are public on-chain — safe to include
          previousCid: event.previousCid,
          newCid: event.newCid,
          $process_person_profile: false,
        },
      });

      await client.shutdown();
    } catch {
      // PostHog errors are silently discarded
    }
  })();
}

/**
 * Capture a general CLI command usage event for reach/adoption tracking.
 * Only the command name and projectId are sent — no secrets, no addresses.
 *
 * Usage: captureCliUsage("push", config.projectId)
 */
export function captureCliUsage(command: string, projectId?: string | number): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return;

  void (async () => {
    try {
      const client = getClient(apiKey);
      await client.capture({
        distinctId: projectId ? `project-${projectId}` : "fheenv-system",
        event: `fheenv_cli_${command}`,
        properties: {
          command,
          projectId,
          $process_person_profile: false,
        },
      });
      await client.shutdown();
    } catch {
      /* silently discard */
    }
  })();
}
