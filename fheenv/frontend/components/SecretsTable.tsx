"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import { FheTypes } from "@cofhe/sdk";
import { cofheClient } from "@/lib/cofhe";
import { joinUint128ToAesKey, aesDecrypt } from "@/lib/aes";
import { fetchFromIPFS } from "@/lib/ipfs";
import { parseEnv } from "@/lib/envParser";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

type Props = { projectId: bigint; envName: string };

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
    });
    const envData = rawEnvData as unknown as EnvTuple | undefined;

    const aesKeyHighHandle = envData?.[0];
    const aesKeyLowHandle = envData?.[1];
    const blobCid = envData?.[2];
    const version = envData?.[3];

    async function handleView() {
        if (!walletClient || !publicClient || !address) return;
        if (!aesKeyHighHandle || !aesKeyLowHandle || !blobCid) {
            setError("No environment data found on-chain.");
            return;
        }
        if (aesKeyHighHandle === 0n && aesKeyLowHandle === 0n) {
            setError("Environment has not been pushed yet.");
            return;
        }

        setLoading(true); setError(null); setSecrets(null);
        try {
            setLoadingMsg("⚙️  Connecting to CoFHE...");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await cofheClient.connect(publicClient as any, walletClient as any);

            setLoadingMsg("🔑 Creating permit...");
            await cofheClient.permits.getOrCreateSelfPermit();

            setLoadingMsg("🔐 Requesting decryption from Threshold Network...");
            const highDecrypted = await cofheClient
                .decryptForView(aesKeyHighHandle, FheTypes.Uint128)
                .withPermit()
                .onPoll((ctx) => {
                    setLoadingMsg(
                        `🔐 Polling Threshold Network... attempt ${ctx.attemptIndex + 1} (${Math.round(ctx.elapsedMs / 1000)}s elapsed)`
                    );
                })
                .execute();

            setLoadingMsg("🔐 Decrypting second key half...");
            const lowDecrypted = await cofheClient
                .decryptForView(aesKeyLowHandle, FheTypes.Uint128)
                .withPermit()
                .onPoll((ctx) => {
                    setLoadingMsg(
                        `🔐 Polling Threshold Network... attempt ${ctx.attemptIndex + 1} (${Math.round(ctx.elapsedMs / 1000)}s elapsed)`
                    );
                })
                .execute();

            setLoadingMsg("📥 Fetching encrypted blob from IPFS...");
            const encryptedBlob = await fetchFromIPFS(blobCid);

            setLoadingMsg("🔓 Decrypting .env locally...");
            const aesKey = joinUint128ToAesKey(highDecrypted as bigint, lowDecrypted as bigint);
            const plaintext = await aesDecrypt(encryptedBlob, aesKey);
            const parsed = parseEnv(plaintext);

            setSecrets(parsed);
            setLoadingMsg("");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
            setLoadingMsg("");
        } finally {
            setLoading(false);
        }
    }

    function handleHide() {
        setSecrets(null);
        setRevealed({});
        setError(null);
    }

    if (envLoading) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-sm text-gray-500">Loading environment data...</p>
            </div>
        );
    }

    const hasData = aesKeyHighHandle && aesKeyHighHandle !== 0n;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="font-semibold">View Secrets — <span className="text-indigo-400">{envName}</span></h3>
                    {version !== undefined && version > 0n && (
                        <p className="text-xs text-gray-500 mt-0.5">Version {version.toString()}</p>
                    )}
                </div>
                {!secrets ? (
                    <button onClick={handleView} disabled={loading || !hasData}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
                        {loading ? "Decrypting..." : "🔓 View Secrets"}
                    </button>
                ) : (
                    <button onClick={handleHide}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
                        🔒 Hide
                    </button>
                )}
            </div>

            {!hasData && !loading && (
                <p className="text-sm text-gray-600 italic">No secrets pushed yet for this environment.</p>
            )}

            {loading && loadingMsg && (
                <div className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-indigo-300 animate-pulse">
                    {loadingMsg}
                </div>
            )}

            {error && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400">
                    {error}
                </div>
            )}

            {secrets && Object.keys(secrets).length === 0 && (
                <p className="text-sm text-gray-500 italic">No key=value pairs found.</p>
            )}

            {secrets && Object.keys(secrets).length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="text-left py-2 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wider">Key</th>
                                <th className="text-left py-2 text-gray-400 font-medium text-xs uppercase tracking-wider">Value</th>
                                <th className="w-16"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(secrets).map(([key, value]) => (
                                <tr key={key} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                    <td className="py-2 pr-4 font-mono text-green-400 whitespace-nowrap">{key}</td>
                                    <td className="py-2 font-mono text-gray-300 break-all">
                                        {revealed[key] ? value : "••••••••••••"}
                                    </td>
                                    <td className="py-2 pl-2">
                                        <button
                                            onClick={() => setRevealed((r) => ({ ...r, [key]: !r[key] }))}
                                            className="text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            {revealed[key] ? "hide" : "show"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-xs text-gray-600 mt-3 text-right">
                        {Object.keys(secrets).length} variable{Object.keys(secrets).length !== 1 ? "s" : ""} · decrypted locally
                    </p>
                </div>
            )}
        </div>
    );
}
