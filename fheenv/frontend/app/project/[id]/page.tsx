"use client";
import { use } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { WalletButton } from "@/components/WalletButton";
import { AuditLog } from "@/components/AuditLog";

const ENVIRONMENTS = [
    { name: "development", label: "Development", indicator: "🟢" },
    { name: "staging", label: "Staging", indicator: "🟡" },
    { name: "production", label: "Production", indicator: "🔴" },
] as const;

type Props = { params: Promise<{ id: string }> };

export default function ProjectPage({ params }: Props) {
    const { id } = use(params);
    const projectId = BigInt(id);

    type ProjectTuple = readonly [string, string, bigint, boolean];
    const { data: raw, isLoading } = useReadContract({
        address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
        functionName: "projects", args: [projectId],
        chainId: 11155111,
    });
    const project = raw as unknown as ProjectTuple | undefined;

    return (
        <main className="max-w-4xl mx-auto px-4 py-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <nav className="flex items-center gap-2 text-sm text-gray-500">
                    <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
                    <span>/</span>
                    <span className="text-white font-medium">
                        {isLoading ? "..." : project?.[0] ?? `Project #${id}`}
                    </span>
                </nav>
                <WalletButton />
            </div>

            {/* Project info */}
            {project && project[3] && (
                <div className="mb-8 pb-6 border-b border-gray-800">
                    <h1 className="text-2xl font-bold mb-1">{project[0]}</h1>
                    <p className="text-xs text-gray-500 font-mono">
                        Owner: {project[1].slice(0, 8)}...{project[1].slice(-6)}
                    </p>
                </div>
            )}

            {/* Environments */}
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Environments</h2>
            <div className="space-y-3">
                {ENVIRONMENTS.map(({ name, label, indicator }) => (
                    <Link
                        key={name}
                        href={`/project/${id}/env/${name}`}
                        className="flex items-center justify-between border border-gray-800 rounded-xl p-5 bg-gray-900 hover:border-indigo-600 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-lg">{indicator}</span>
                            <div>
                                <p className="font-medium group-hover:text-indigo-300 transition-colors">{label}</p>
                                <p className="text-xs text-gray-500 font-mono mt-0.5">{name}</p>
                            </div>
                        </div>
                        <span className="text-gray-600 group-hover:text-indigo-400 transition-colors text-lg">→</span>
                    </Link>
                ))}
            </div>

            <p className="text-xs text-gray-700 mt-6 text-center">
                Project #{id}
            </p>

            {/* Audit Log */}
            <div className="mt-10">
                <AuditLog projectId={projectId} />
            </div>
        </main>
    );
}
