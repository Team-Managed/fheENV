"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import { generateAesKey, aesEncrypt, aesDecrypt, joinUint128ToAesKey, splitAesKeyToUint128 } from "@/lib/aes";
import { fetchFromIPFS, uploadToIPFS } from "@/lib/ipfs";
import { parseEnv, serializeEnv } from "@/lib/envParser";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, AlertCircle, Download, Pencil, Plus, Trash2, Check, X } from "lucide-react";

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

    // Edit mode state
    const [editMode, setEditMode] = useState(false);
    const [editedSecrets, setEditedSecrets] = useState<Record<string, string>>({});
    const [newKey, setNewKey] = useState("");
    const [newVal, setNewVal] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");

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
            const { cofheClient, FheTypes } = await import("@/lib/cofhe");
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

    function handleHide() { setSecrets(null); setRevealed({}); setError(null); setEditMode(false); }

    /** Download the decrypted secrets as a .env file */
    function handleDownload() {
        if (!secrets) return;
        const content = serializeEnv(secrets);
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `.env.${envName}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Enter edit mode — copy current secrets into editable state */
    function enterEditMode() {
        if (!secrets) return;
        setEditedSecrets({ ...secrets });
        setEditMode(true);
        setRevealed(Object.fromEntries(Object.keys(secrets).map(k => [k, true])));
    }

    function cancelEditMode() {
        setEditMode(false);
        setNewKey(""); setNewVal("");
        setSaveMsg("");
    }

    function updateValue(key: string, val: string) {
        setEditedSecrets(prev => ({ ...prev, [key]: val }));
    }

    function deleteKey(key: string) {
        setEditedSecrets(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }

    function addRow() {
        const k = newKey.trim();
        if (!k) return;
        setEditedSecrets(prev => ({ ...prev, [k]: newVal }));
        setNewKey(""); setNewVal("");
    }

    /** Re-encrypt the edited secrets and push to chain */
    async function handleSave() {
        if (!walletClient || !publicClient || !address) return;
        setSaving(true); setSaveMsg("Generating new AES key…");
        try {
            // 1. Serialize edited secrets to .env string
            const content = serializeEnv(editedSecrets);

            // 2. Encrypt with fresh AES key
            setSaveMsg("Encrypting with AES-256-GCM…");
            const aesKey = await generateAesKey();
            const encryptedBlob = await aesEncrypt(content, aesKey);

            // 3. Upload to IPFS
            setSaveMsg("Uploading to IPFS…");
            const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
            if (!jwt) throw new Error("NEXT_PUBLIC_PINATA_JWT not set");
            const cid = await uploadToIPFS(encryptedBlob, `${projectId}-${envName}`);

            // 4. FHE-encrypt new key halves
            setSaveMsg("FHE-encrypting AES key…");
            const { cofheClient, Encryptable } = await import("@/lib/cofhe");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await cofheClient.connect(publicClient as any, walletClient as any);
            const [keyHigh, keyLow] = splitAesKeyToUint128(aesKey);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [encHigh, encLow] = await cofheClient
                .encryptInputs([Encryptable.uint128(keyHigh), Encryptable.uint128(keyLow)])
                .execute() as any;

            // 5. Submit to chain
            setSaveMsg("Submitting to blockchain…");
            const { request } = await publicClient.simulateContract({
                address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
                functionName: "updateEnvironment",
                args: [projectId, envName, encHigh, encLow, cid, version ?? 0n],
                account: address,
            });
            await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract(request) });

            // 6. Update local state
            setSecrets({ ...editedSecrets });
            setEditMode(false);
            setSaveMsg("");
        } catch (e: unknown) {
            setSaveMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
        } finally { setSaving(false); }
    }

    const displaySecrets = editMode ? editedSecrets : secrets;

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
                <div className="flex items-center gap-2">
                    {secrets && !editMode && (
                        <>
                            <button onClick={handleDownload} title="Download as .env file"
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
                                style={{ color: "var(--text-muted)", border: "1px solid var(--surface-border)" }}>
                                <Download className="size-3.5" /> Download
                            </button>
                            <button onClick={enterEditMode} title="Edit variables"
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
                                style={{ color: "var(--aqua)", border: "1px solid rgba(45,212,191,0.3)" }}>
                                <Pencil className="size-3.5" /> Edit
                            </button>
                            <button onClick={handleHide} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all" style={{ color: "var(--text-muted)", border: "1px solid var(--surface-border)" }}>
                                <EyeOff className="size-3.5" /> Hide
                            </button>
                        </>
                    )}
                    {!secrets && (
                        <button onClick={handleView} disabled={loading || envLoading || !blobCid}
                            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-full font-bold transition-all disabled:opacity-40"
                            style={{ background: "var(--aqua)", color: "#030712", boxShadow: "0 0 12px var(--aqua-glow)" }}
                        >
                            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                            {loading ? "Decrypting…" : "Decrypt Secrets"}
                        </button>
                    )}
                </div>
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
            {displaySecrets && (
                <>
                    {Object.keys(displaySecrets).length === 0 && !editMode ? (
                        <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No key=value pairs found.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--surface-border)" }}>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr style={{ borderBottom: "1px solid var(--surface-border)", background: "rgba(255,255,255,0.02)" }}>
                                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Key</th>
                                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Value</th>
                                        <th className="w-16" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(displaySecrets).map(([key, value]) => (
                                        <tr key={key} style={{ borderBottom: "1px solid var(--surface-border)" }}>
                                            <td className="px-4 py-2 font-mono font-medium" style={{ color: "var(--aqua)", whiteSpace: "nowrap" }}>{key}</td>
                                            <td className="px-4 py-2 font-mono text-slate-300 max-w-xs">
                                                {editMode ? (
                                                    <input
                                                        value={value}
                                                        onChange={e => updateValue(key, e.target.value)}
                                                        className="w-full rounded-lg px-2 py-1 text-xs font-mono text-slate-200 outline-none"
                                                        style={{ background: "rgba(3,7,18,0.8)", border: "1px solid var(--surface-border)" }}
                                                        onFocus={e => (e.target.style.borderColor = "var(--aqua)")}
                                                        onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                                                    />
                                                ) : (
                                                    revealed[key] ? value : "•".repeat(Math.min(value.length, 24))
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {editMode ? (
                                                    <button onClick={() => deleteKey(key)} className="transition-colors" style={{ color: "#f87171" }}>
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setRevealed(r => ({ ...r, [key]: !r[key] }))} className="transition-colors" style={{ color: "var(--text-muted)" }}>
                                                        {revealed[key] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Add new row (edit mode only) */}
                                    {editMode && (
                                        <tr style={{ borderBottom: "1px solid var(--surface-border)", background: "rgba(45,212,191,0.02)" }}>
                                            <td className="px-4 py-2">
                                                <input
                                                    placeholder="NEW_KEY"
                                                    value={newKey}
                                                    onChange={e => setNewKey(e.target.value)}
                                                    onKeyDown={e => e.key === "Enter" && addRow()}
                                                    className="w-full rounded-lg px-2 py-1 text-xs font-mono outline-none"
                                                    style={{ background: "rgba(3,7,18,0.8)", border: "1px solid var(--surface-border)", color: "var(--aqua)" }}
                                                    onFocus={e => (e.target.style.borderColor = "var(--aqua)")}
                                                    onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    placeholder="value"
                                                    value={newVal}
                                                    onChange={e => setNewVal(e.target.value)}
                                                    onKeyDown={e => e.key === "Enter" && addRow()}
                                                    className="w-full rounded-lg px-2 py-1 text-xs font-mono text-slate-300 outline-none"
                                                    style={{ background: "rgba(3,7,18,0.8)", border: "1px solid var(--surface-border)" }}
                                                    onFocus={e => (e.target.style.borderColor = "var(--aqua)")}
                                                    onBlur={e => (e.target.style.borderColor = "var(--surface-border)")}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <button onClick={addRow} disabled={!newKey.trim()} className="transition-colors disabled:opacity-30" style={{ color: "var(--aqua)" }}>
                                                    <Plus className="size-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Edit mode action bar */}
                    {editMode && (
                        <div className="mt-4">
                            {saveMsg && (
                                <p className={`text-xs font-mono mb-3 ${saveMsg.startsWith("Error") ? "text-red-400" : "animate-pulse"}`}
                                    style={saveMsg.startsWith("Error") ? {} : { color: "var(--aqua)" }}>
                                    {saveMsg}
                                </p>
                            )}
                            <div className="flex items-center gap-2.5">
                                <button onClick={handleSave} disabled={saving}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all disabled:opacity-40"
                                    style={{ background: "var(--aqua)", color: "#030712", boxShadow: "0 0 12px var(--aqua-glow)" }}>
                                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                    {saving ? "Saving…" : "Encrypt & Save"}
                                </button>
                                <button onClick={cancelEditMode} disabled={saving}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-all disabled:opacity-40"
                                    style={{ color: "var(--text-muted)", border: "1px solid var(--surface-border)" }}>
                                    <X className="size-3.5" /> Cancel
                                </button>
                                <p className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                                    Re-encrypts with a fresh AES key · new IPFS blob
                                </p>
                            </div>
                        </div>
                    )}

                    {!editMode && (
                        <div className="flex items-center gap-1.5 mt-3.5">
                            <ShieldCheck className="size-3.5" style={{ color: "var(--aqua)" }} />
                            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                                {Object.keys(displaySecrets).length} variable{Object.keys(displaySecrets).length !== 1 ? "s" : ""} · decrypted locally · never transmitted
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

