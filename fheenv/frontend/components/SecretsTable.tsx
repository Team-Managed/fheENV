"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import { FheTypes } from "@cofhe/sdk";
import { cofheClient } from "@/lib/cofhe";
import { joinUint128ToAesKey, aesDecrypt } from "@/lib/aes";
import { fetchFromIPFS } from "@/lib/ipfs";
import { parseEnv } from "@/lib/envParser";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, AlertCircle } from "lucide-react";

type Props = { projectId: bigint; envName: string };

const cardStyle = {
    background: "var(--surface)",
    border: "1px solid var(--surface-border)",
    borderRadius: "0.875rem",
    padding: "1.5rem",
};

export function SecretsTable({ projectId, envName }: Props) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [secrets, setSecrets] = useState<Record<string, string> | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});

    type EnvTuple = readonly [bigint, bigint, string, bigint, bigint];
    const { data: rawEnvData, isLoading: envLoading } = useReadContract({
        address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
        functionName: "getEnvironment", args: [projectId, envName],
        chainId: 11155111,
    });
    const envData = rawEnvData as unknown as EnvTuple | undefined;
    const aesKeyHighHandle = envData?.[0];
    const aesKeyLowHandle = envData?.[1];
    const blobCid = envData?.[2];
    const version = envData?.[3];

    async function handleView() {
        if (!walletClient || !publicClient || !address) return;
        if (!aesKeyHighHandle || !aesKeyLowHandle || !blobCid) { setError("No environment data found on-chain."); return; }
        if (aesKeyHighHandle === 0n && aesKeyLowHandle === 0n) { setError("Environment has not been pushed yet."); return; }
        setLoading(true); setError(null); setSecrets(null);
        try {
            setLoadingMsg("Connecting to CoFHE…");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await cofheClient.connect(publicClient as any, walletClient as any);
            setLoadingMsg("Creating FHE permit…");
            await cofheClient.permits.getOrCreateSelfPermit();
            setLoadingMsg("Requesting decryption from Threshold Network…");
            const highDecrypted = await cofheClient.decryptForView(aesKeyHighHandle, FheTypes.Uint128).withPermit()
                .onPoll((ctx) => setLoadingMsg(`Threshold Network · attempt ${ctx.attemptIndex + 1} · ${Math.round(ctx.elapsedMs / 1000)}s`))
                .execute();
            setLoadingMsg("Decrypting second key half…");
            const lowDecrypted = await cofheClient.decryptForView(aesKeyLowHandle, FheTypes.Uint128).withPermit()
                .onPoll((ctx) => setLoadingMsg(`Threshold Network · attempt ${ctx.attemptIndex + 1}`))
                .execute();
            setLoadingMsg("Fetching encrypted blob from IPFS…");
            const encryptedBlob = await fetchFromIPFS(blobCid);
            setLoadingMsg("Decrypting .env locally…");
            const aesKey = joinUint128ToAesKey(highDecrypted as bigint, lowDecrypted as bigint);
            const plaintext = await aesDecrypt(encryptedBlob, aesKey);
            setSecrets(parseEnv(plaintext));
            setLoadingMsg("");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
            setLoadingMsg("");
        } finally { setLoading(false); }
    }

    function handleHide() { setSecrets(null); setRevealed({}); setError(null); }

    return (
        <div style={cardStyle}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(45,212,191,0.1)" }}>
                        <Lock className="size-4" style={{ color: "var(--aqua)" }} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-200">Secrets</p>
                        {version !== undefined && version > 0n && (
                            <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>v{version.toString()}</p>
                        )}
                    </div>
                </div>
                {secrets ? (
                    <button onClick={handleHide} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all" style={{ color: "var(--text-muted)", border: "1px solid var(--surface-border)" }}>
                        <EyeOff className="size-3.5" /> Hide
                    </button>
                ) : (
                    <button onClick={handleView} disabled={loading || envLoading || !blobCid}
                        className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-full font-bold transition-all disabled:opacity-40"
                        style={{ background: "var(--aqua)", color: "#030712", boxShadow: "0 0 12px var(--aqua-glow)" }}
                    >
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                        {loading ? "Decrypting…" : "Decrypt Secrets"}
                    </button>
                )}
            </div>

            {/* Loading message */}
            {loading && loadingMsg && (
                <p className="text-xs font-mono mb-4 animate-pulse" style={{ color: "var(--aqua)" }}>{loadingMsg}</p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2.5 rounded-xl p-3.5 mb-4" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-mono text-red-400 break-all">{error}</p>
                </div>
            )}

            {/* No env pushed yet */}
            {!loading && !secrets && !error && blobCid === "" && (
                <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No secrets pushed yet for <span className="font-mono">{envName}</span>.</p>
            )}

            {/* Secrets table */}
            {secrets && (
                <>
                    {Object.keys(secrets).length === 0 ? (
                        <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No key=value pairs found.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--surface-border)" }}>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ borderBottom: "1px solid var(--surface-border)", background: "rgba(255,255,255,0.02)" }}>
                                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Key</th>
                                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Value</th>
                                        <th className="w-12" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(secrets).map(([key, value]) => (
                                        <tr key={key} style={{ borderBottom: "1px solid var(--surface-border)" }}>
                                            <td className="px-4 py-2.5 font-mono font-medium" style={{ color: "var(--aqua)", whiteSpace: "nowrap" }}>{key}</td>
                                            <td className="px-4 py-2.5 font-mono text-slate-300 max-w-xs break-all">
                                                {revealed[key] ? value : "•".repeat(Math.min(value.length, 24))}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <button onClick={() => setRevealed(r => ({ ...r, [key]: !r[key] }))} className="transition-colors" style={{ color: "var(--text-muted)" }}>
                                                    {revealed[key] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-3.5">
                        <ShieldCheck className="size-3.5" style={{ color: "var(--aqua)" }} />
                        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                            {Object.keys(secrets).length} variable{Object.keys(secrets).length !== 1 ? "s" : ""} · decrypted locally · never transmitted
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}

