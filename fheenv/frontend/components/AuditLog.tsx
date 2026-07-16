"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { decodeEventLog, type Hex } from "viem";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

const BLOCKSCOUT_API = "https://eth-sepolia.blockscout.com/api/v2";

type EventName =
  | "EnvironmentUpdated"
  | "AccessGranted"
  | "AccessRevoked"
  | "AccessGrantedWithExpiry"
  | "RotatorGranted"
  | "RotatorRevoked";

const EVENT_STYLES: Record<EventName, { label: string; color: string; dot: string }> = {
  EnvironmentUpdated: {
    label: "Key Rotated",
    color: "text-indigo-400",
    dot: "bg-indigo-400",
  },
  AccessGranted: { label: "Access Granted", color: "text-green-400", dot: "bg-green-400" },
  AccessRevoked: { label: "Access Revoked", color: "text-red-400", dot: "bg-red-400" },
  AccessGrantedWithExpiry: {
    label: "Timed Access Granted",
    color: "text-green-400",
    dot: "bg-green-400",
  },
  RotatorGranted: {
    label: "Rotator Granted",
    color: "text-cyan-400",
    dot: "bg-cyan-400",
  },
  RotatorRevoked: {
    label: "Rotator Revoked",
    color: "text-red-400",
    dot: "bg-red-400",
  },
};

const SOC2_EVENT_TYPES: Record<EventName, "rotation" | "access_granted" | "access_revoked"> = {
  EnvironmentUpdated: "rotation",
  AccessGranted: "access_granted",
  AccessRevoked: "access_revoked",
  AccessGrantedWithExpiry: "access_granted",
  RotatorGranted: "access_granted",
  RotatorRevoked: "access_revoked",
};

interface BlockscoutLog {
  block_number: number;
  block_timestamp: string;
  data: Hex;
  index: number;
  topics: (Hex | null)[];
  transaction_hash: Hex;
}

interface BlockscoutResponse {
  items: BlockscoutLog[];
  next_page_params: Record<string, string | number> | null;
}

interface AuditEntry {
  eventName: EventName;
  label: string;
  color: string;
  dot: string;
  blockNumber: number;
  timestamp: string;
  transactionHash: Hex;
  logIndex: number;
  actor: string;
  target: string;
  environment: string;
  newCid: string;
  version: string;
  expiresAt: string;
}

type Props = { projectId: bigint };

function shortHex(value: string) {
  return value ? `${value.slice(0, 8)}...${value.slice(-6)}` : "";
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function fetchRegistryLogs(signal: AbortSignal) {
  const logs: BlockscoutLog[] = [];
  let pageUrl = `${BLOCKSCOUT_API}/addresses/${REGISTRY_ADDRESS}/logs`;

  while (pageUrl) {
    const response = await fetch(pageUrl, { signal });
    if (!response.ok) throw new Error("Could not load indexed on-chain events.");

    const page = (await response.json()) as BlockscoutResponse;
    logs.push(...page.items);

    if (!page.next_page_params) break;
    const query = new URLSearchParams(
      Object.entries(page.next_page_params).map(([key, value]) => [key, String(value)]),
    );
    pageUrl = `${BLOCKSCOUT_API}/addresses/${REGISTRY_ADDRESS}/logs?${query}`;
  }

  return logs;
}

function decodeAuditEntry(log: BlockscoutLog, projectId: bigint): AuditEntry | null {
  const topics = log.topics.filter((topic): topic is Hex => topic !== null);

  try {
    const decoded = decodeEventLog({
      abi: REGISTRY_ABI,
      data: log.data,
      topics: topics as [Hex, ...Hex[]],
      strict: true,
    });

    if (!("projectId" in decoded.args) || decoded.args.projectId !== projectId) return null;
    if (!(decoded.eventName in EVENT_STYLES)) return null;

    const eventName = decoded.eventName as EventName;
    const actor = "";
    let target = "";
    let environment = "";
    let newCid = "";
    let version = "";
    let expiresAt = "";

    switch (decoded.eventName) {
      case "EnvironmentUpdated":
        environment = decoded.args.envHash;
        newCid = decoded.args.blobCid;
        version = decoded.args.version.toString();
        break;
      case "AccessGranted":
      case "AccessRevoked":
        environment = decoded.args.envHash;
        target = decoded.args.member;
        break;
      case "AccessGrantedWithExpiry":
        environment = decoded.args.envHash;
        target = decoded.args.member;
        expiresAt = new Date(Number(decoded.args.expiresAt) * 1000).toISOString();
        break;
      case "RotatorGranted":
      case "RotatorRevoked":
        target = decoded.args.rotator;
        break;
      default:
        return null;
    }

    return {
      eventName,
      ...EVENT_STYLES[eventName],
      blockNumber: log.block_number,
      timestamp: log.block_timestamp,
      transactionHash: log.transaction_hash,
      logIndex: log.index,
      actor,
      target,
      environment,
      newCid,
      version,
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function AuditLog({ projectId }: Props) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const entries = (await fetchRegistryLogs(controller.signal))
          .map((log) => decodeAuditEntry(log, projectId))
          .filter((entry): entry is AuditEntry => entry !== null)
          .sort(
            (left, right) => right.blockNumber - left.blockNumber || right.logIndex - left.logIndex,
          );
        setLogs(entries);
      } catch (caught: unknown) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Could not load audit events.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [projectId]);

  function downloadCsv() {
    const headers = [
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
    const rows = logs.map((log) =>
      [
        log.timestamp,
        SOC2_EVENT_TYPES[log.eventName],
        "",
        log.actor,
        log.environment,
        log.target,
        "",
        log.newCid,
        log.transactionHash,
        "",
        projectId.toString(),
        "on_chain",
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[headers.join(","), ...rows].join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fheenv-project-${projectId}-audit.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="rounded-xl border border-white/8 bg-white/3 p-6"
      aria-labelledby="audit-log-heading"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2
          id="audit-log-heading"
          className="text-xs font-semibold uppercase tracking-widest text-slate-400"
        >
          On-chain Audit Evidence
        </h2>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={logs.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-brand-blue/60 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>

      {loading && (
        <p className="animate-pulse font-mono text-xs text-brand-blue">
          Loading indexed on-chain events...
        </p>
      )}
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      {!loading && !error && logs.length === 0 && (
        <p className="text-xs text-slate-500">No on-chain events recorded for this project.</p>
      )}

      {!loading && !error && logs.length > 0 && (
        <ol className="space-y-3">
          {logs.map((log) => (
            <li key={`${log.transactionHash}-${log.logIndex}`} className="flex items-start gap-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${log.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`text-xs font-semibold ${log.color}`}>{log.label}</span>
                  {log.version && (
                    <span className="font-mono text-xs text-slate-500">v{log.version}</span>
                  )}
                  {log.target && (
                    <span className="font-mono text-xs text-slate-500">{shortHex(log.target)}</span>
                  )}
                  {log.expiresAt && (
                    <span className="text-xs text-slate-500">
                      expires {new Date(log.expiresAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <time dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleString()}</time>
                  <span className="font-mono">#{log.blockNumber}</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${log.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue transition-colors hover:text-brand-sand"
                  >
                    View transaction
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
