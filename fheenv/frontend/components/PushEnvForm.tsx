"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import { cofheClient, Encryptable } from "@/lib/cofhe";
import { generateAesKey, aesEncrypt, splitAesKeyToUint128 } from "@/lib/aes";
import { uploadToIPFS } from "@/lib/ipfs";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

type Props = { projectId: bigint; envName: string };

export function PushEnvForm({ projectId, envName }: Props) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [rawEnv, setRawEnv] = useState("");
    const [log, setLog] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    type EnvTuple = readonly [bigint, bigint, string, bigint, bigint];
    const { data: rawEnvData } = useReadContract({
        address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
        functionName: "getEnvironment", args: [projectId, envName],
    });
    const envData = rawEnvData as unknown as EnvTuple | undefined;
    const currentVersion = envData ? envData[3] : 0n;

    function addLog(msg: string) { setLog((p) => [...p, msg]); }

    async function handlePush() {
        if (!walletClient || !publicClient || !address || !rawEnv.trim()) return;
        setLoading(true); setLog([]);
        try {
            addLog("🔑 Generating fresh AES-256 key locally...");
            const aesKey = await generateAesKey();

            addLog("🔒 Encrypting .env with AES-256-GCM (stays in your browser)...");
            const encryptedBlob = await aesEncrypt(rawEnv, aesKey);

            addLog("📤 Uploading encrypted blob to IPFS...");
            const cid = await uploadToIPFS(encryptedBlob, `${projectId}-${envName}`);
            addLog(`✅ IPFS: ${cid.slice(0, 16)}...`);

            addLog("⚙️  Connecting to CoFHE...");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await cofheClient.connect(publicClient as any, walletClient as any);

            addLog("🔐 FHE-encrypting AES key (2x euint128)...");
            const [keyHigh, keyLow] = splitAesKeyToUint128(aesKey);
            const [encHigh, encLow] = await cofheClient
                .encryptInputs([Encryptable.uint128(keyHigh), Encryptable.uint128(keyLow)])
                .onStep((step, ctx) => {
                    if (ctx?.isStart) addLog(`   ⏳ ${step}...`);
                    if (ctx?.isEnd) addLog(`   ✓ ${step} (${ctx.duration}ms)`);
                })
                .execute();

            addLog("📝 Submitting to blockchain...");
            const { request } = await publicClient.simulateContract({
                address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
                functionName: "updateEnvironment",
                args: [projectId, envName, encHigh, encLow, cid, currentVersion],
                account: address,
            });
            const hash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });

            addLog(`✅ Done! Tx: ${hash.slice(0, 10)}...`);
            addLog("🔒 AES key stored as FHE ciphertext. Zero plaintext on-chain.");
            setRawEnv("");
        } catch (e: unknown) { addLog(`❌ ${e instanceof Error ? e.message : String(e)}`); }
        finally { setLoading(false); }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold mb-1">Push Secrets — <span className="text-indigo-400">{envName}</span></h3>
            <p className="text-xs text-gray-500 mb-4">Encryption happens in your browser. Nothing plaintext leaves your device.</p>
            <textarea value={rawEnv} onChange={(e) => setRawEnv(e.target.value)}
                placeholder={"DATABASE_URL=postgres://...\nOPENAI_KEY=sk-proj-...\nSTRIPE_SECRET=sk_live_..."}
                rows={8} className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 mb-4 resize-none" />
            <button onClick={handlePush} disabled={loading || !rawEnv.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium">
                {loading ? "Encrypting & Pushing..." : "🔒 Encrypt & Push"}
            </button>
            {log.length > 0 && (
                <div className="mt-4 bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-300 space-y-1 max-h-40 overflow-y-auto">
                    {log.map((l, i) => <p key={i}>{l}</p>)}
                </div>
            )}
        </div>
    );
}
