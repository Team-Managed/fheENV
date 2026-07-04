"use client";
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { REGISTRY_ADDRESS } from "@/lib/contracts";
import { formatDistanceToNow } from "date-fns";

// ── Event ABIs (minimal, for getLogs) ────────────────────────────────────────
const EVENTS = [
    {
        label: "Environment Updated",
        color: "text-indigo-400",
        dot: "bg-indigo-400",
        // keccak256("EnvironmentUpdated(uint256,bytes32,string,uint256)")
        topic: "0x63fb4d7e58f02d38af288abddf4dc348f2e8cb499d4d925a0a824ae061eeb73c" as `0x${string}`,
    },
    {
        label: "Access Granted",
        color: "text-green-400",
        dot: "bg-green-400",
        // keccak256("AccessGranted(uint256,bytes32,address)")
        topic: "0x7901bc0b5970f2d4954caeb7f443382e198a9eca0bd48cf52d65413ab9e2b971" as `0x${string}`,
    },
    {
        label: "Access Revoked",
        color: "text-red-400",
        dot: "bg-red-400",
        // keccak256("AccessRevoked(uint256,bytes32,address)")
        topic: "0x44fde7990b0868c66623a80253e32e4fd439aaf2775eb1a94b4d5862f42d1aa4" as `0x${string}`,
    },
    {
        label: "Owner Added",
        color: "text-yellow-400",
        dot: "bg-yellow-400",
        // keccak256("OwnerAdded(uint256,address)")
        topic: "0xab7a51f59a55e3b65bbabf99457f8955ff12366d20e368988c35d2eab9bd8df9" as `0x${string}`,
    },
] as const;

interface LogEntry {
    label: string;
    color: string;
    dot: string;
    blockNumber: bigint;
    txHash: `0x${string}`;
    timestamp?: number;
    detail: string;
}

type Props = { projectId: bigint };

export function AuditLog({ projectId }: Props) {
    const publicClient = usePublicClient();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!publicClient || !REGISTRY_ADDRESS) return;

        async function fetchLogs() {
            setLoading(true);
            setError(null);
            try {
                const projectIdHex = (
                    "0x" + projectId.toString(16).padStart(64, "0")
                ) as `0x${string}`;

                const allLogs: LogEntry[] = [];

                for (const ev of EVENTS) {
                    const raw = await publicClient!.getLogs({
                        address: REGISTRY_ADDRESS,
                        topics: [ev.topic, projectIdHex],
                        fromBlock: 0n,
                    });

                    for (const l of raw) {
                        // Build a short detail string from topics
                        let detail = "";
                        if (l.topics[3]) {
                            // third indexed param — usually an address
                            detail = "0x" + l.topics[3].slice(26);
                        } else if (l.topics[2]) {
                            detail = l.topics[2].slice(0, 18) + "…";
                        }

                        allLogs.push({
                            label: ev.label,
                            color: ev.color,
                            dot: ev.dot,
                            blockNumber: l.blockNumber ?? 0n,
                            txHash: l.transactionHash ?? ("0x" as `0x${string}`),
                            detail,
                        });
                    }
                }

                // Sort newest first
                allLogs.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));

                // Fetch block timestamps for the most recent 20
                const recent = allLogs.slice(0, 20);
                const blocks = await Promise.all(
                    [...new Set(recent.map((l) => l.blockNumber))].map((bn) =>
                        publicClient!.getBlock({ blockNumber: bn }),
                    ),
                );
                const tsMap = new Map(blocks.map((b) => [b.number, Number(b.timestamp)]));
                recent.forEach((l) => {
                    l.timestamp = tsMap.get(l.blockNumber);
                });

                setLogs(recent);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to load audit log");
            } finally {
                setLoading(false);
            }
        }

        fetchLogs();
    }, [publicClient, projectId]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">
                Audit Log
            </h3>

            {loading && (
                <p className="text-xs text-gray-500 animate-pulse">
                    Loading on-chain events…
                </p>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            {!loading && !error && logs.length === 0 && (
                <p className="text-xs text-gray-600">No events yet for this project.</p>
            )}

            {!loading && logs.length > 0 && (
                <ol className="space-y-3">
                    {logs.map((l, i) => (
                        <li key={i} className="flex items-start gap-3 text-xs">
                            <span
                                className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${l.dot}`}
                            />
                            <div className="flex-1 min-w-0">
                                <span className={`font-medium ${l.color}`}>{l.label}</span>
                                {l.detail && (
                                    <span className="ml-2 text-gray-500 font-mono truncate">
                                        {l.detail}
                                    </span>
                                )}
                                <div className="flex items-center gap-2 mt-0.5 text-gray-600">
                                    <span>Block {l.blockNumber.toString()}</span>
                                    {l.timestamp && (
                                        <span>
                                            ·{" "}
                                            {formatDistanceToNow(new Date(l.timestamp * 1000), {
                                                addSuffix: true,
                                            })}
                                        </span>
                                    )}
                                    <a
                                        href={`https://sepolia.etherscan.io/tx/${l.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-indigo-400 transition-colors"
                                    >
                                        ↗ tx
                                    </a>
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
