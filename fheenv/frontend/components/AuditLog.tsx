"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { decodeEventLog, type Hex } from "viem";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import {
  fetchAuditEventsFromIndexer,
  type AuditEntry,
  type EventName,
  EVENT_STYLES,
  EVENT_TYPES,
} from "@/lib/indexer";

const BLOCKSCOUT_API = "https://eth-sepolia.blockscout.com/api/v2";

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

interface BlockscoutTransaction {
  from?: { hash?: string } | string;
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

async function fetchTransactionActor(transactionHash: Hex, signal: AbortSignal) {
  const response = await fetch(`${BLOCKSCOUT_API}/transactions/${transactionHash}`, { signal });
  if (!response.ok) return "";
  const transaction = (await response.json()) as BlockscoutTransaction;
  return typeof transaction.from === "string" ? transaction.from : (transaction.from?.hash ?? "");
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
    let actor = "";
    let target = "";
    let environment = "";
    let newCid = "";
    let version = "";

    switch (decoded.eventName) {
      case "ProjectCreated":
        actor = decoded.args.owner;
        target = decoded.args.owner;
        break;
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
      case "OwnerAdded":
        target = decoded.args.newOwner;
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
      expiresAt: "",
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
        const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_GRAPHQL_URL;
        let resolvedEntries: AuditEntry[] | null = null;

        if (indexerUrl) {
          try {
            resolvedEntries = await fetchAuditEventsFromIndexer(
              projectId,
              indexerUrl,
              controller.signal,
            );
          } catch (indexerError: unknown) {
            if (!controller.signal.aborted) {
              console.warn(
                "Ponder indexer query failed, falling back to Blockscout:",
                indexerError instanceof Error ? indexerError.message : indexerError,
              );
            }
            resolvedEntries = null;
          }
        }

        if (!resolvedEntries) {
          const rawLogs = await fetchRegistryLogs(controller.signal);
          const entries = rawLogs
            .map((log) => decodeAuditEntry(log, projectId))
            .filter((entry): entry is AuditEntry => entry !== null)
            .sort(
              (left, right) =>
                right.blockNumber - left.blockNumber || right.logIndex - left.logIndex,
            );
          const actors = await Promise.all(
            entries.map(async (entry) => ({
              transactionHash: entry.transactionHash,
              actor:
                entry.actor ||
                (await fetchTransactionActor(entry.transactionHash, controller.signal)),
            })),
          );
          const actorsByTransaction = new Map(
            actors.map((entry) => [entry.transactionHash, entry.actor]),
          );
          resolvedEntries = entries.map((entry) => ({
            ...entry,
            actor: actorsByTransaction.get(entry.transactionHash) ?? entry.actor,
          }));
        }

        if (!controller.signal.aborted) {
          setLogs(resolvedEntries);
        }
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
      "Actor address",
      "Subject address",
      "Environment hash",
      "New CID",
      "Version",
      "Tx hash",
      "Project ID",
    ];
    const rows = logs.map((log) =>
      [
        log.timestamp,
        EVENT_TYPES[log.eventName],
        log.actor,
        log.target,
        log.environment,
        log.newCid,
        log.version,
        log.transactionHash,
        projectId.toString(),
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
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <time dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleString()}</time>
                  <span className="font-mono">#{log.blockNumber}</span>
                  {log.actor && <span className="font-mono">by {shortHex(log.actor)}</span>}
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
