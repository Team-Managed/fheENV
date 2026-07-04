"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-4">New Project</h2>
        <input autoFocus type="text" placeholder="my-app" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500" />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={handleCreate} disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium">
            {loading ? "Creating..." : "Create Project"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white border border-gray-700 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
