"use client";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useRouter } from "next/navigation";
import { WalletButton } from "@/components/WalletButton";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

export default function Dashboard() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const { data: nextId } = useReadContract({
    address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "nextProjectId",
  });

  const projectIds = Array.from({ length: Number(nextId ?? 0) }, (_, i) => BigInt(i));

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold"><span className="text-indigo-400">fhe</span>ENV</h1>
          <p className="text-gray-500 text-sm mt-1">Your .env, encrypted. Not even us.</p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && (
            <button onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              + New Project
            </button>
          )}
          <WalletButton />
        </div>
      </div>

      {!isConnected ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-5xl mb-4">🔐</p>
          <p className="text-lg">Connect your wallet to manage projects.</p>
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
  const { data: raw } = useReadContract({
    address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "projects", args: [projectId],
  });
  const project = raw as unknown as ProjectTuple | undefined;
  if (!project || !project[3]) return null;
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
