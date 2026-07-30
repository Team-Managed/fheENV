import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

export const ANALYTICS_EVENTS = [
  "cli_initialized",
  "project_created",
  "environment_pushed",
  "environment_pulled",
  "member_added",
  "member_removed",
  "rotation_completed",
  "rotation_failed",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

interface AnalyticsSettings {
  analyticsConsent: true;
  analyticsId: string;
}

export interface AnalyticsPayload {
  distinct_id: string;
  event: AnalyticsEvent;
  properties: {
    cliVersion: string;
    osFamily: NodeJS.Platform;
    success?: boolean;
    durationBucket?: string;
  };
}

interface CaptureDependencies {
  settingsPath?: string;
  send?(payload: AnalyticsPayload): Promise<void>;
}

const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), ".fheenv", "settings.json");
const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);

function readCliVersion(): string {
  try {
    const packagePath = path.resolve(__dirname, "../../package.json");
    return (JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

function readSettings(settingsPath: string): AnalyticsSettings | null {
  if (!fs.existsSync(settingsPath)) return null;
  try {
    const settings = JSON.parse(
      fs.readFileSync(settingsPath, "utf8"),
    ) as Partial<AnalyticsSettings>;
    if (settings.analyticsConsent !== true || typeof settings.analyticsId !== "string") return null;
    return settings as AnalyticsSettings;
  } catch {
    return null;
  }
}

export function enableAnalytics(settingsPath = DEFAULT_SETTINGS_PATH): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ analyticsConsent: true, analyticsId: randomUUID() }, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );
  fs.chmodSync(settingsPath, 0o600);
}

export function disableAnalytics(settingsPath = DEFAULT_SETTINGS_PATH): void {
  if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
}

export function getAnalyticsStatus(
  settingsPath = DEFAULT_SETTINGS_PATH,
): { enabled: false } | { enabled: true; analyticsId: string } {
  const settings = readSettings(settingsPath);
  return settings ? { enabled: true, analyticsId: settings.analyticsId } : { enabled: false };
}

async function sendToPostHog(payload: AnalyticsPayload): Promise<void> {
  const apiKey = process.env.FHEENV_ANALYTICS_KEY;
  if (!apiKey) return;
  const host = (process.env.FHEENV_ANALYTICS_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");
  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...payload }),
  });
  if (!response.ok) throw new Error(`Analytics request failed with HTTP ${response.status}.`);
}

export async function captureAnalytics(
  event: string,
  properties: Record<string, unknown> = {},
  dependencies: CaptureDependencies = {},
): Promise<void> {
  if (!EVENT_SET.has(event)) throw new Error(`Unknown analytics event: ${event}`);
  const settings = readSettings(dependencies.settingsPath ?? DEFAULT_SETTINGS_PATH);
  if (!settings) return;

  const payload: AnalyticsPayload = {
    distinct_id: settings.analyticsId,
    event: event as AnalyticsEvent,
    properties: {
      cliVersion: readCliVersion(),
      osFamily: process.platform,
      ...(typeof properties.success === "boolean" ? { success: properties.success } : {}),
      ...(typeof properties.durationBucket === "string"
        ? { durationBucket: properties.durationBucket }
        : {}),
    },
  };

  try {
    await (dependencies.send ?? sendToPostHog)(payload);
  } catch {
    // Product analytics is optional and must never affect CLI correctness.
  }
}
