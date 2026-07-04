"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useReadContract, usePublicClient, useWalletClient, useAccount } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { SecretsTable } from "@/components/SecretsTable";
import { PushEnvForm } from "@/components/PushEnvForm";
import { TeamManager } from "@/components/TeamManager";
import { ChevronRight, RefreshCw } from "lucide-react";

const ENV_DOT: Record<string, string> = {
    development: "#22c55e",
    staging: "#eab308",
    production: "#ef4444",
};

type Props = { params: Promise<{ id: string; env: string }> };

export default function EnvPage({ params }: Props) {
    const { id, env } = use(params);
    const projectId = BigInt(id);
    const dot = ENV_DOT[env] ?? "#94a3b8";

    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();

    const [rotateLog, setRotateLog] = useState<string | null>(null);
    const [rotating, setRotating] = useState(false);

    type ProjectTuple = readonly [string, string, bigint, boolean];
    const { data: raw } = useReadContract({
        address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
        functionName: "projects", args: [projectId],
        chainId: 11155111,
    });
    const project = raw as unknown as ProjectTuple | undefined;
    const projectName = project?.[0] ?? `Project #${id}`;

    async function handleRotate() {
        if (!walletClient || !publicClient || !address) return;
        setRotating(true);
        setRotateLog("⚙️  Use the CLI for full rotation:\n  fheenv rotate --env " + env);
        setRotating(false);
    }

    return (
        <>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm mb-8" style={{ color: "var(--text-muted)" }}>
                <Link href="/dashboard" className="hover:text-slate-200 transition-colors">Projects</Link>
                <ChevronRight className="size-3.5" />
                <Link href={`/project/${id}`} className="hover:text-slate-200 transition-colors">{projectName}</Link>
                <ChevronRight className="size-3.5" />
                <span className="text-slate-200 font-medium capitalize">{env}</span>
            </nav>

            {/* Page title */}
            <div className="flex items-center justify-between mb-8 pb-7" style={{ borderBottom: "1px solid var(--surface-border)" }}>
                <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full shrink-0" style={{ background: dot, boxShadow: `0 0 10px ${dot}88` }} />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-100 capitalize">{env}</h1>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{projectName}</p>
                    </div>
                </div>
                <button
                    onClick={handleRotate}
                    disabled={rotating}
                    title="Re-encrypt with a fresh AES key. For full rotation, use: fheenv rotate --env"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={{ border: "1px solid rgba(234,179,8,0.3)", color: "#eab308", background: "rgba(234,179,8,0.06)" }}
                >
                    <RefreshCw className={`size-3.5 ${rotating ? "animate-spin" : ""}`} />
                    Rotate Key
                </button>
            </div>

            {rotateLog && (
                <div className="mb-6 rounded-xl px-4 py-3 text-xs font-mono whitespace-pre-wrap" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)", color: "#fbbf24" }}>
                    {rotateLog}
                </div>
            )}

            {/* Components */}
            <div className="space-y-5">
                <SecretsTable projectId={projectId} envName={env} />
                <PushEnvForm projectId={projectId} envName={env} />
                <TeamManager projectId={projectId} envName={env} />
            </div>
        </>
    );
}


const ENV_INDICATORS: Record<string, string> = {
    development: "🟢",
    staging: "🟡",
    production: "🔴",
};
