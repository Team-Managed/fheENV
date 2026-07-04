"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { Users, Loader2, AlertTriangle } from "lucide-react";

type Props = { projectId: bigint; envName: string };

const inputStyle = {
    background: "rgba(3,7,18,0.6)",
    border: "1px solid var(--surface-border)",
    borderRadius: "0.75rem",
    padding: "0.625rem 0.875rem",
    fontSize: "0.75rem",
    fontFamily: "var(--font-mono)",
    color: "#cbd5e1",
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
};

export function TeamManager({ projectId, envName }: Props) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();

    const [grantAddr, setGrantAddr] = useState("");
    const [grantLoading, setGrantLoading] = useState(false);
    const [grantError, setGrantError] = useState<string | null>(null);
    const [grantSuccess, setGrantSuccess] = useState(false);

    const [batchRaw, setBatchRaw] = useState("");
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchError, setBatchError] = useState<string | null>(null);
    const [batchSuccess, setBatchSuccess] = useState(false);

    const [revokeAddr, setRevokeAddr] = useState("");
    const [revokeLoading, setRevokeLoading] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);
    const [revokeSuccess, setRevokeSuccess] = useState(false);

    async function handleGrant() {
        if (!walletClient || !publicClient || !address) return;
        const target = grantAddr.trim();
        if (!target || !target.startsWith("0x")) { setGrantError("Enter a valid 0x address"); return; }
        setGrantLoading(true); setGrantError(null); setGrantSuccess(false);
        try {
            const { request } = await publicClient.simulateContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "grantAccess", args: [projectId, envName, target as `0x${string}`], account: address });
            await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract(request) });
            setGrantSuccess(true); setGrantAddr("");
        } catch (e: unknown) { setGrantError(e instanceof Error ? e.message : String(e)); }
        finally { setGrantLoading(false); }
    }

    async function handleBatchGrant() {
        if (!walletClient || !publicClient || !address) return;
        const lines = batchRaw.split(/[\n,\s]+/).map(s => s.trim()).filter(s => s.startsWith("0x") && s.length === 42);
        if (lines.length === 0) { setBatchError("No valid addresses found"); return; }
        if (lines.length > 100) { setBatchError("Maximum 100 addresses per batch"); return; }
        setBatchLoading(true); setBatchError(null); setBatchSuccess(false);
        try {
            const { request } = await publicClient.simulateContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "batchGrantAccess", args: [projectId, envName, lines as `0x${string}`[]], account: address });
            await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract(request) });
            setBatchSuccess(true); setBatchRaw("");
        } catch (e: unknown) { setBatchError(e instanceof Error ? e.message : String(e)); }
        finally { setBatchLoading(false); }
    }

    async function handleRevoke() {
        if (!walletClient || !publicClient || !address) return;
        const target = revokeAddr.trim();
        if (!target || !target.startsWith("0x")) { setRevokeError("Enter a valid 0x address"); return; }
        setRevokeLoading(true); setRevokeError(null); setRevokeSuccess(false);
        try {
            const { request } = await publicClient.simulateContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "revokeAccess", args: [projectId, envName, target as `0x${string}`], account: address });
            await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract(request) });
            setRevokeSuccess(true); setRevokeAddr("");
        } catch (e: unknown) { setRevokeError(e instanceof Error ? e.message : String(e)); }
        finally { setRevokeLoading(false); }
    }

    return (
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "0.875rem", padding: "1.5rem" }}>
            <div className="flex items-center gap-2.5 mb-6">
                <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(45,212,191,0.1)" }}>
                    <Users className="size-4" style={{ color: "var(--aqua)" }} />
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-200">Team Access</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Manage who can decrypt <span className="font-mono">{envName}</span></p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Single grant */}
                <section>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Grant access</label>
                    <div className="flex gap-2">
                        <input type="text" placeholder="0xabc…def" value={grantAddr}
                            onChange={e => { setGrantAddr(e.target.value); setGrantError(null); setGrantSuccess(false); }}
                            onKeyDown={e => e.key === "Enter" && handleGrant()}
                            style={inputStyle}
                            onFocus={e => (e.target.style.borderColor = "var(--aqua)")}
                            onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                        />
                        <button onClick={handleGrant} disabled={grantLoading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all disabled:opacity-40"
                            style={{ background: "var(--aqua)", color: "#030712" }}>
                            {grantLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            {grantLoading ? "…" : "Grant"}
                        </button>
                    </div>
                    {grantError && <p className="text-xs text-red-400 mt-1.5 font-mono">{grantError}</p>}
                    {grantSuccess && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--aqua)" }}>Access granted ✓</p>}
                </section>

                {/* Batch grant */}
                <section>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>Batch grant <span className="normal-case font-normal">(one address per line · max 100)</span></label>
                    <textarea value={batchRaw} onChange={e => { setBatchRaw(e.target.value); setBatchError(null); setBatchSuccess(false); }}
                        placeholder={"0xaaa...111\n0xbbb...222"}
                        rows={4}
                        style={{ ...inputStyle, resize: "none", display: "block", marginBottom: "0.5rem" }}
                        onFocus={e => (e.target.style.borderColor = "var(--aqua)")}
                        onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                    />
                    <button onClick={handleBatchGrant} disabled={batchLoading || !batchRaw.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all disabled:opacity-40"
                        style={{ background: "var(--aqua)", color: "#030712" }}>
                        {batchLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {batchLoading ? "Granting…" : "Batch Grant"}
                    </button>
                    {batchError && <p className="text-xs text-red-400 mt-1.5 font-mono">{batchError}</p>}
                    {batchSuccess && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--aqua)" }}>Batch access granted ✓</p>}
                </section>

                {/* Revoke */}
                <section style={{ paddingTop: "1.5rem", borderTop: "1px solid var(--surface-border)" }}>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Revoke access</label>
                    <div className="flex gap-2">
                        <input type="text" placeholder="0xabc…def" value={revokeAddr}
                            onChange={e => { setRevokeAddr(e.target.value); setRevokeError(null); setRevokeSuccess(false); }}
                            onKeyDown={e => e.key === "Enter" && handleRevoke()}
                            style={inputStyle}
                            onFocus={e => (e.target.style.borderColor = "#f87171")}
                            onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                        />
                        <button onClick={handleRevoke} disabled={revokeLoading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all disabled:opacity-40"
                            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                            {revokeLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            {revokeLoading ? "…" : "Revoke"}
                        </button>
                    </div>
                    {revokeError && <p className="text-xs text-red-400 mt-1.5 font-mono">{revokeError}</p>}
                    {revokeSuccess && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-xs" style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.25)" }}>
                            <AlertTriangle className="size-3.5 text-yellow-400 mt-0.5 shrink-0" />
                            <div style={{ color: "#fbbf24" }}>
                                <p className="font-semibold mb-0.5">Rotation required</p>
                                <p className="font-normal" style={{ color: "rgba(251,191,36,0.7)" }}>
                                    The removed member may still hold a cached AES key. Run <code className="font-mono">fheenv rotate --env {envName}</code> to issue new ciphertexts they cannot decrypt.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

