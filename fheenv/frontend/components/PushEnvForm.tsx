"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
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
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "getEnvironment",
    args: [projectId, envName],
    chainId: 11155111,
  });
  const envData = rawEnvData as unknown as EnvTuple | undefined;
  const currentVersion = envData ? envData[3] : 0n;

  function addLog(msg: string) {
    setLog((p) => [...p, msg]);
  }

  async function handlePush() {
    if (!walletClient || !publicClient || !address || !rawEnv.trim()) return;
    setLoading(true);
    setLog([]);
    try {
      addLog("🔑 Generating fresh AES-256 key locally...");
      const aesKey = await generateAesKey();

      addLog("🔒 Encrypting .env with AES-256-GCM (stays in your browser)...");
      const encryptedBlob = await aesEncrypt(rawEnv, aesKey);

      addLog("📤 Uploading encrypted blob to IPFS...");
      const cid = await uploadToIPFS(encryptedBlob, `${projectId}-${envName}`);
      addLog(`✅ IPFS: ${cid.slice(0, 16)}...`);

      addLog("⚙️  Connecting to CoFHE...");
      const { cofheClient, Encryptable } = await import("@/lib/cofhe");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await cofheClient.connect(publicClient as any, walletClient as any);

      addLog("🔐 FHE-encrypting AES key (2x euint128)...");
      const [keyHigh, keyLow] = splitAesKeyToUint128(aesKey);
      const [encHigh, encLow] = (await cofheClient
        .encryptInputs([Encryptable.uint128(keyHigh), Encryptable.uint128(keyLow)])
        .onStep((step, ctx) => {
          if (ctx?.isStart) addLog(`   ⏳ ${step}...`);
          if (ctx?.isEnd) addLog(`   ✓ ${step} (${ctx.duration}ms)`);
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .execute()) as any;

      addLog("📝 Submitting to blockchain...");
      const { request } = await publicClient.simulateContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "updateEnvironment",
        args: [projectId, envName, encHigh, encLow, cid, currentVersion],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });

      addLog(`✅ Done! Tx: ${hash.slice(0, 10)}...`);
      addLog("🔒 AES key stored as FHE ciphertext. Zero plaintext on-chain.");
      setRawEnv("");
    } catch (e: unknown) {
      addLog(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
        borderRadius: "0.875rem",
        padding: "1.5rem",
      }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div
          className="size-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(45,212,191,0.1)" }}
        >
          <span className="text-base">⬆</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">Push Secrets</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Encryption happens in your browser — plaintext never leaves your device.
          </p>
        </div>
      </div>
      <textarea
        value={rawEnv}
        onChange={(e) => setRawEnv(e.target.value)}
        placeholder={
          "DATABASE_URL=postgres://...\nOPENAI_KEY=sk-proj-...\nSTRIPE_SECRET=sk_live_..."
        }
        rows={7}
        className="w-full rounded-xl px-4 py-3 text-xs font-mono text-slate-300 outline-none transition-all resize-none mb-4"
        style={{ background: "rgba(3,7,18,0.6)", border: "1px solid var(--surface-border)" }}
        onFocus={(e) => (e.target.style.borderColor = "var(--aqua)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--surface-border)")}
      />
      <button
        onClick={handlePush}
        disabled={loading || !rawEnv.trim()}
        className="w-full py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-40"
        style={{
          background: "var(--aqua)",
          color: "#030712",
          boxShadow: loading ? "none" : "0 0 14px var(--aqua-glow)",
        }}
      >
        {loading ? "Encrypting & Pushing…" : "Encrypt & Push →"}
      </button>
      {log.length > 0 && (
        <div
          className="mt-4 rounded-xl p-3.5 max-h-40 overflow-y-auto space-y-1"
          style={{ background: "rgba(3,7,18,0.7)", border: "1px solid var(--surface-border)" }}
        >
          {log.map((l, i) => (
            <p
              key={i}
              className="text-xs font-mono"
              style={{
                color: l.startsWith("✅")
                  ? "var(--aqua)"
                  : l.startsWith("❌")
                    ? "#f87171"
                    : "var(--text-muted)",
              }}
            >
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
