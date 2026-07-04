"use client";
import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useRouter } from "next/navigation";
import { WalletButton } from "@/components/WalletButton";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

export default function Dashboard() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  // Prevent hydration mismatch: isConnected is false on server, true on client
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Direct RPC sanity check — bypasses wagmi entirely
    const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
    fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: REGISTRY_ADDRESS, data: "0xe935b7b1" /* nextProjectId() */ }, "latest"],
      }),
    })
      .then(r => r.json())
      .then(j => console.log("[fheENV] direct RPC result for nextProjectId():", j))
      .catch(e => console.error("[fheENV] direct RPC error:", e));
  }, []);
  const clientConnected = mounted && isConnected;

  const { data: nextId, isLoading: loadingCount, error: countError } = useReadContract({
    address: REGISTRY_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "nextProjectId",
    chainId: 11155111,
    query: { enabled: !!REGISTRY_ADDRESS },
  });

  // ── Debug: log every render so we can see what wagmi returns ──────────────
  console.log("[fheENV] REGISTRY_ADDRESS:", REGISTRY_ADDRESS);
  console.log("[fheENV] nextId:", nextId?.toString(), "| loading:", loadingCount, "| error:", countError?.message ?? null);
  console.log("[fheENV] wallet:", address, "| connected:", isConnected, "| mounted:", mounted);

  const projectIds = Array.from({ length: Number(nextId ?? 0) }, (_, i) => BigInt(i));
  console.log("[fheENV] projectIds:", projectIds.map(String));

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold"><span className="text-indigo-400">fhe</span>ENV</h1>
          <p className="text-gray-500 text-sm mt-1">Your .env, encrypted. Not even us.</p>
        </div>
        <div className="flex items-center gap-3">
          {clientConnected && (
            <button onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              + New Project
            </button>
          )}
          <WalletButton />
        </div>
      </div>

      {!clientConnected ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-5xl mb-4">🔐</p>
          <p className="text-lg">Connect your wallet to manage projects.</p>
        </div>
      ) : loadingCount ? (
        <div className="text-center py-20 text-gray-600">
          <p className="animate-pulse">Loading projects from Sepolia…</p>
        </div>
      ) : countError ? (
        <div className="text-center py-20 text-red-500 text-sm font-mono">
          <p className="mb-2">⚠ Failed to read from contract</p>
          <p className="text-xs text-gray-600 break-all">{countError.message}</p>
          <p className="text-xs text-gray-600 mt-2">Registry: {REGISTRY_ADDRESS}</p>
        </div>
      ) : projectIds.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-5xl mb-4">📦</p>
          <p>No projects yet.</p>
          <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-400 hover:underline text-sm">
            Create your first project →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectIds.map((id) => (
            <ProjectCard key={id.toString()} projectId={id} onClick={() => router.push(`/project/${id}`)} />
          ))}
        </div>
      )}

      {showModal && (
        <CreateProjectModal onClose={() => setShowModal(false)}
          onCreated={(id) => { setShowModal(false); router.push(`/project/${id}`); }} />
      )}
    </main>
  );
}

type ProjectTuple = readonly [string, string, bigint, boolean];

function ProjectCard({ projectId, onClick }: { projectId: bigint; onClick: () => void }) {
  const { data: raw, error: cardError } = useReadContract({
    address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "projects", args: [projectId],
    chainId: 11155111,
  });
  console.log(`[fheENV] ProjectCard #${projectId}:`, raw, "error:", cardError?.message ?? null);
  const project = raw as unknown as ProjectTuple | undefined;
  if (!project || !project[3]) {
    console.log(`[fheENV] ProjectCard #${projectId} hidden — project[3] (exists):`, project?.[3]);
    return null;
  }
  return (
    <button onClick={onClick}
      className="text-left border border-gray-800 rounded-xl p-5 bg-gray-900 hover:border-indigo-600 transition-colors">
      <p className="text-xl mb-1">📁</p>
      <p className="font-semibold">{project[0]}</p>
      <p className="text-xs text-gray-500 font-mono mt-1">{project[1].slice(0, 6)}...{project[1].slice(-4)}</p>
      <p className="text-xs text-gray-600 mt-2">Project #{projectId.toString()}</p>
    </button>
  );
}
