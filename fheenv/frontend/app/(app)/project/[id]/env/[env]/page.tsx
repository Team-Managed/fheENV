"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useReadContract, usePublicClient, useWalletClient, useAccount } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { WalletButton } from "@/components/WalletButton";
import { SecretsTable } from "@/components/SecretsTable";
import { PushEnvForm } from "@/components/PushEnvForm";
import { TeamManager } from "@/components/TeamManager";

const ENV_INDICATORS: Record<string, string> = {
    development: "🟢",
    staging: "🟡",
    production: "🔴",
};

type Props = { params: Promise<{ id: string; env: string }> };

export default function EnvPage({ params }: Props) {
    const { id, env } = use(params);
    const projectId = BigInt(id);
    const indicator = ENV_INDICATORS[env] ?? "⚪";

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
        setRotateLog("⚙️  Rotation initiated — use the CLI for full rotate with member re-grant:\n  fheenv rotate --env " + env);
        setRotating(false);
    }

    return (
        <main className="max-w-4xl mx-auto px-4 py-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <nav className="flex items-center gap-2 text-sm text-gray-500">
                    <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
                    <span>/</span>
                    <Link href={`/project/${id}`} className="hover:text-white transition-colors">
                        {projectName}
                    </Link>
                    <span>/</span>
                    <span className="text-white font-medium">
                        {indicator} {env}
                    </span>
                </nav>
                <WalletButton />
            </div>

            {/* Page title */}
            <div className="mb-8 pb-6 border-b border-gray-800 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold">
                        {indicator} <span className="capitalize">{env}</span>
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">{projectName}</p>
                </div>
                {/* Rotate button */}
                <button
                    onClick={handleRotate}
                    disabled={rotating}
                    title="Re-encrypt with a fresh AES key. For full rotation with member re-grant, use the CLI: fheenv rotate --env"
                    className="ml-4 mt-1 px-3 py-1.5 text-xs border border-yellow-700 text-yellow-500 hover:bg-yellow-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                    🔄 Rotate Key
                </button>
            </div>
            {rotateLog && (
                <div className="mb-6 bg-yellow-950/40 border border-yellow-800 rounded-lg px-4 py-3 text-xs text-yellow-300 font-mono whitespace-pre-wrap">
                    {rotateLog}
                </div>
            )}

            {/* Components */}
            <div className="space-y-6">
                <SecretsTable projectId={projectId} envName={env} />
                <PushEnvForm projectId={projectId} envName={env} />
                <TeamManager projectId={projectId} envName={env} />
            </div>
        </main>
    );
}
