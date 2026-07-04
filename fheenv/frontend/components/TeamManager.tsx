"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

type Props = { projectId: bigint; envName: string };

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
        if (!target || !target.startsWith("0x")) { setGrantError("Enter a valid address"); return; }
        setGrantLoading(true); setGrantError(null); setGrantSuccess(false);
        try {
            const { request } = await publicClient.simulateContract({
                address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
                functionName: "grantAccess",
                args: [projectId, envName, target as `0x${string}`],
                account: address,
            });
            const hash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            setGrantSuccess(true);
            setGrantAddr("");
        } catch (e: unknown) { setGrantError(e instanceof Error ? e.message : String(e)); }
        finally { setGrantLoading(false); }
    }

    async function handleBatchGrant() {
        if (!walletClient || !publicClient || !address) return;
        const lines = batchRaw
            .split(/[\n,\s]+/)
            .map((s) => s.trim())
            .filter((s) => s.startsWith("0x") && s.length === 42);
        if (lines.length === 0) { setBatchError("No valid addresses found"); return; }
        if (lines.length > 100) { setBatchError("Maximum 100 addresses per batch"); return; }
        setBatchLoading(true); setBatchError(null); setBatchSuccess(false);
        try {
            const { request } = await publicClient.simulateContract({
                address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
                functionName: "batchGrantAccess",
                args: [projectId, envName, lines as `0x${string}`[]],
                account: address,
            });
            const hash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            setBatchSuccess(true);
            setBatchRaw("");
        } catch (e: unknown) { setBatchError(e instanceof Error ? e.message : String(e)); }
        finally { setBatchLoading(false); }
    }

    async function handleRevoke() {
        if (!walletClient || !publicClient || !address) return;
        const target = revokeAddr.trim();
        if (!target || !target.startsWith("0x")) { setRevokeError("Enter a valid address"); return; }
        setRevokeLoading(true); setRevokeError(null); setRevokeSuccess(false);
        try {
            const { request } = await publicClient.simulateContract({
                address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
                functionName: "revokeAccess",
                args: [projectId, envName, target as `0x${string}`],
                account: address,
            });
            const hash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            setRevokeSuccess(true);
            setRevokeAddr("");
        } catch (e: unknown) { setRevokeError(e instanceof Error ? e.message : String(e)); }
        finally { setRevokeLoading(false); }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-8">
            <h3 className="font-semibold">Team Access — <span className="text-indigo-400">{envName}</span></h3>

            {/* Single grant */}
            <section>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Grant Access</h4>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="0xabc...def"
                        value={grantAddr}
                        onChange={(e) => { setGrantAddr(e.target.value); setGrantError(null); setGrantSuccess(false); }}
                        onKeyDown={(e) => e.key === "Enter" && handleGrant()}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <button onClick={handleGrant} disabled={grantLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                        {grantLoading ? "Granting..." : "Grant"}
                    </button>
                </div>
                {grantError && <p className="text-red-400 text-xs mt-2">{grantError}</p>}
                {grantSuccess && <p className="text-green-400 text-xs mt-2">✅ Access granted</p>}
            </section>

            {/* Batch grant */}
            <section>
                <h4 className="text-sm font-medium text-gray-300 mb-1">Batch Grant (up to 100)</h4>
                <p className="text-xs text-gray-600 mb-2">One address per line, or comma-separated.</p>
                <textarea
                    value={batchRaw}
                    onChange={(e) => { setBatchRaw(e.target.value); setBatchError(null); setBatchSuccess(false); }}
                    placeholder={"0xaaa...111\n0xbbb...222\n0xccc...333"}
                    rows={4}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                />
                <button onClick={handleBatchGrant} disabled={batchLoading || !batchRaw.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    {batchLoading ? "Granting..." : "Batch Grant"}
                </button>
                {batchError && <p className="text-red-400 text-xs mt-2">{batchError}</p>}
                {batchSuccess && <p className="text-green-400 text-xs mt-2">✅ Batch access granted</p>}
            </section>

            {/* Revoke */}
            <section>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Revoke Access</h4>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="0xabc...def"
                        value={revokeAddr}
                        onChange={(e) => { setRevokeAddr(e.target.value); setRevokeError(null); setRevokeSuccess(false); }}
                        onKeyDown={(e) => e.key === "Enter" && handleRevoke()}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <button onClick={handleRevoke} disabled={revokeLoading}
                        className="bg-red-700 hover:bg-red-800 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                        {revokeLoading ? "Revoking..." : "Revoke"}
                    </button>
                </div>
                {revokeError && <p className="text-red-400 text-xs mt-2">{revokeError}</p>}
                {revokeSuccess && (
                    <div className="mt-3 bg-yellow-950/40 border border-yellow-700 rounded-lg p-3 text-xs text-yellow-300">
                        <p className="font-semibold mb-1">⚠️  Rotation recommended</p>
                        <p>
                            Revoking access prevents future decryption, but the revoked member may still hold a local copy of the AES key from a previous view.
                            For full security, push a new version of your secrets now — this re-encrypts with a fresh AES key.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
