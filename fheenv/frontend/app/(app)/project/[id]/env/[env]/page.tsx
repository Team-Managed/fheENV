"use client";
import { use } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
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

    type ProjectTuple = readonly [string, string, bigint, boolean];
    const { data: raw } = useReadContract({
        address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
        functionName: "projects", args: [projectId],
    });
    const project = raw as unknown as ProjectTuple | undefined;

    const projectName = project?.[0] ?? `Project #${id}`;

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
            <div className="mb-8 pb-6 border-b border-gray-800">
                <h1 className="text-2xl font-bold">
                    {indicator} <span className="capitalize">{env}</span>
                </h1>
                <p className="text-sm text-gray-500 mt-1">{projectName}</p>
            </div>

            {/* Components */}
            <div className="space-y-6">
                <SecretsTable projectId={projectId} envName={env} />
                <PushEnvForm projectId={projectId} envName={env} />
                <TeamManager projectId={projectId} envName={env} />
            </div>
        </main>
    );
}
