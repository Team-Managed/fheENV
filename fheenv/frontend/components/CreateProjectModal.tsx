"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { X, Loader2 } from "lucide-react";

type Props = { onClose: () => void; onCreated: (id: bigint) => void };

export function CreateProjectModal({ onClose, onCreated }: Props) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCreate() {
        if (!walletClient || !publicClient || !address) return;
        if (!name.trim()) { setError("Enter a project name"); return; }
        setLoading(true); setError(null);
        try {
            const { request } = await publicClient.simulateContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "createProject",
                args: [name.trim()],
                account: address,
            });
            const hash = await walletClient.writeContract(request);
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            const projectId = BigInt(receipt.logs[0]?.topics[1] ?? "0");
            onCreated(projectId);
        } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setLoading(false); }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{ background: "rgba(3,7,18,0.75)", backdropFilter: "blur(4px)" }}>
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#0f172a", border: "1px solid var(--surface-border)", boxShadow: "0 0 60px rgba(0,0,0,0.6)" }}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-base font-bold text-slate-100">New Project</h2>
                    <button onClick={onClose} className="rounded-lg p-1.5 transition-colors" style={{ color: "var(--text-muted)" }}>
                        <X className="size-4" />
                    </button>
                </div>
                <div className="mb-4">
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>Project name</label>
                    <input
                        autoFocus type="text" placeholder="my-app"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        className="w-full rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 outline-none transition-all"
                        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
                        onFocus={e => (e.target.style.borderColor = "var(--aqua)")}
                        onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                    />
                </div>
                {error && <p className="text-xs text-red-400 mb-3 font-mono">{error}</p>}
                <div className="flex gap-2.5">
                    <button
                        onClick={handleCreate}
                        disabled={loading || !name.trim()}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-50"
                        style={{ background: "var(--aqua)", color: "#030712", boxShadow: loading ? "none" : "0 0 14px var(--aqua-glow)" }}
                    >
                        {loading ? <><Loader2 className="size-3.5 animate-spin" /> Creating…</> : "Create Project"}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-full text-sm transition-all"
                        style={{ color: "var(--text-muted)", border: "1px solid var(--surface-border)" }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

