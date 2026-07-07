"use client";
import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { parseAbiItem } from "viem";
import { useRouter } from "next/navigation";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { REGISTRY_ABI, REGISTRY_ADDRESS, DEPLOY_BLOCK } from "@/lib/contracts";
import { FolderLock, Plus, Loader2, AlertCircle, FolderOpen } from "lucide-react";

export default function Dashboard() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const publicClient = usePublicClient({ chainId: 11155111 });
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const clientConnected = mounted && isConnected;

  const [ownedProjectIds, setOwnedProjectIds] = useState<bigint[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<Error | null>(null);

  useEffect(() => {
    if (!address || !publicClient || !REGISTRY_ADDRESS) {
      setOwnedProjectIds([]);
      return;
    }
    let cancelled = false;
    setLoadingProjects(true);
    setProjectsError(null);

    Promise.all([
      publicClient.getLogs({
        address: REGISTRY_ADDRESS,
        event: parseAbiItem(
          "event ProjectCreated(uint256 indexed projectId, address indexed owner, string name)",
        ),
        args: { owner: address },
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: REGISTRY_ADDRESS,
        event: parseAbiItem(
          "event OwnerAdded(uint256 indexed projectId, address indexed newOwner)",
        ),
        args: { newOwner: address },
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
    ])
      .then(([createdLogs, addedLogs]) => {
        if (cancelled) return;
        const ids = new Set<bigint>();
        for (const log of createdLogs) {
          if (log.args.projectId !== undefined) ids.add(log.args.projectId);
        }
        for (const log of addedLogs) {
          if (log.args.projectId !== undefined) ids.add(log.args.projectId);
        }
        setOwnedProjectIds([...ids].sort((a, b) => (a < b ? -1 : 1)));
        setLoadingProjects(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProjectsError(err instanceof Error ? err : new Error(String(err)));
          setLoadingProjects(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Projects</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Each project holds isolated environments with FHE-encrypted secrets.
          </p>
        </div>
        {clientConnected && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all"
            style={{
              background: "var(--aqua)",
              color: "#030712",
              boxShadow: "0 0 16px var(--aqua-glow)",
            }}
          >
            <Plus className="size-4" />
            New Project
          </button>
        )}
      </div>

      {/* States */}
      {!clientConnected ? (
        <div className="text-center py-24 flex flex-col items-center gap-4">
          <div
            className="size-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
          >
            <FolderLock className="size-6" style={{ color: "var(--aqua)" }} />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Connect your wallet</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Your projects are tied to your wallet address.
            </p>
          </div>
        </div>
      ) : loadingProjects ? (
        <div
          className="text-center py-24 flex flex-col items-center gap-3"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 className="size-6 animate-spin" style={{ color: "var(--aqua)" }} />
          <p className="text-sm">Reading from Sepolia…</p>
        </div>
      ) : projectsError ? (
        <div
          className="rounded-xl p-6 flex items-start gap-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertCircle className="size-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Failed to load projects</p>
            <p className="text-xs mt-1 font-mono break-all" style={{ color: "var(--text-muted)" }}>
              {projectsError.message}
            </p>
          </div>
        </div>
      ) : ownedProjectIds.length === 0 ? (
        <div className="text-center py-24 flex flex-col items-center gap-4">
          <div
            className="size-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
          >
            <FolderOpen className="size-6" style={{ color: "var(--text-muted)" }} />
          </div>
          <div>
            <p className="font-semibold text-slate-300">No projects yet</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Create your first project to start encrypting secrets.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="mt-1 text-sm font-medium transition-colors"
            style={{ color: "var(--aqua)" }}
          >
            Create project →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ownedProjectIds.map((id) => (
            <ProjectCard
              key={id.toString()}
              projectId={id}
              onClick={() => router.push(`/project/${id}`)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateProjectModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false);
            router.push(`/project/${id}`);
          }}
        />
      )}
    </>
  );
}

type ProjectTuple = readonly [string, string, bigint, boolean];

function ProjectCard({
  projectId,
  onClick,
}: {
  projectId: bigint;
  onClick: () => void;
}) {
  const { data: raw } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "projects",
    args: [projectId],
    chainId: 11155111,
  });
  const project = raw as unknown as ProjectTuple | undefined;
  if (!project || !project[3]) return null;
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl p-5 transition-all duration-200"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--aqua)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px var(--aqua-glow)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      <div
        className="size-9 rounded-lg flex items-center justify-center mb-4 transition-colors"
        style={{ background: "rgba(45,212,191,0.1)" }}
      >
        <FolderLock className="size-4" style={{ color: "var(--aqua)" }} />
      </div>
      <p className="font-semibold text-slate-100 text-sm">{project[0]}</p>
      <p className="text-xs font-mono mt-1.5" style={{ color: "var(--text-muted)" }}>
        {project[1].slice(0, 6)}…{project[1].slice(-4)}
      </p>
      <div
        className="flex items-center justify-between mt-4 pt-4"
        style={{ borderTop: "1px solid var(--surface-border)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Project #{projectId.toString()}
        </span>
        <span className="text-xs font-medium transition-colors" style={{ color: "var(--aqua)" }}>
          Open →
        </span>
      </div>
    </button>
  );
}
