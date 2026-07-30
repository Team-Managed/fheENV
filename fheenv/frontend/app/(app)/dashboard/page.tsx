"use client";
import { useState, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { useRouter } from "next/navigation";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { REGISTRY_ADDRESS, REGISTRY_DEPLOY_BLOCK } from "@/lib/contracts";
import {
  reconstructOwnedProjects,
  type OwnedProject,
  type ProjectOwnershipEvent,
} from "@/lib/project-ownership";
import { FolderLock, Plus, Loader2, AlertCircle, FolderOpen, ScrollText } from "lucide-react";

export default function Dashboard() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const publicClient = usePublicClient({ chainId: 11155111 });
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const clientConnected = mounted && isConnected;

  const [ownedProjects, setOwnedProjects] = useState<OwnedProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<Error | null>(null);
  const configurationError =
    REGISTRY_DEPLOY_BLOCK === null
      ? new Error("NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK must be set to the registry deployment block.")
      : null;
  const dashboardError = configurationError ?? projectsError;

  useEffect(() => {
    if (!address || !publicClient || !REGISTRY_ADDRESS || REGISTRY_DEPLOY_BLOCK === null) return;
    const account = address;
    const client = publicClient;
    const deployBlock = REGISTRY_DEPLOY_BLOCK;
    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);
      setProjectsError(null);
      try {
        const [createdLogs, addedLogs, removedLogs] = await Promise.all([
          client.getLogs({
            address: REGISTRY_ADDRESS,
            event: parseAbiItem(
              "event ProjectCreated(uint256 indexed projectId, address indexed owner, string name)",
            ),
            fromBlock: deployBlock,
            toBlock: "latest",
          }),
          client.getLogs({
            address: REGISTRY_ADDRESS,
            event: parseAbiItem(
              "event OwnerAdded(uint256 indexed projectId, address indexed newOwner)",
            ),
            args: { newOwner: account },
            fromBlock: deployBlock,
            toBlock: "latest",
          }),
          client.getLogs({
            address: REGISTRY_ADDRESS,
            event: parseAbiItem(
              "event OwnerRemoved(uint256 indexed projectId, address indexed removedOwner)",
            ),
            args: { removedOwner: account },
            fromBlock: deployBlock,
            toBlock: "latest",
          }),
        ]);
        if (cancelled) return;
        const events: ProjectOwnershipEvent[] = [];
        for (const log of createdLogs) {
          const { projectId, owner, name } = log.args;
          if (projectId === undefined || owner === undefined || name === undefined) continue;
          events.push({
            kind: "created",
            projectId,
            owner,
            name,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
          });
        }
        for (const log of addedLogs) {
          const { projectId, newOwner } = log.args;
          if (projectId === undefined || newOwner === undefined) continue;
          events.push({
            kind: "added",
            projectId,
            owner: newOwner,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
          });
        }
        for (const log of removedLogs) {
          const { projectId, removedOwner } = log.args;
          if (projectId === undefined || removedOwner === undefined) continue;
          events.push({
            kind: "removed",
            projectId,
            owner: removedOwner,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
          });
        }
        setOwnedProjects(reconstructOwnedProjects(events, account));
        setLoadingProjects(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setProjectsError(err instanceof Error ? err : new Error(String(err)));
          setLoadingProjects(false);
        }
      }
    }

    void loadProjects();

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
            Select a project to review its on-chain audit trail.
          </p>
        </div>
        {clientConnected && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all"
            style={{
              background: "var(--brand-blue)",
              color: "#030712",
              boxShadow: "0 0 16px var(--brand-blue-glow)",
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
            <FolderLock className="size-6" style={{ color: "var(--brand-blue)" }} />
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
          <Loader2 className="size-6 animate-spin" style={{ color: "var(--brand-blue)" }} />
          <p className="text-sm">Reading from Sepolia…</p>
        </div>
      ) : dashboardError ? (
        <div
          className="rounded-xl p-6 flex items-start gap-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertCircle className="size-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Failed to load projects</p>
            <p className="text-xs mt-1 font-mono break-all" style={{ color: "var(--text-muted)" }}>
              {dashboardError.message}
            </p>
          </div>
        </div>
      ) : ownedProjects.length === 0 ? (
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
            style={{ color: "var(--brand-blue)" }}
          >
            Create project →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ownedProjects.map((project) => (
              <ProjectCard
                key={project.id.toString()}
                project={project}
                onClick={() => router.push(`/project/${project.id}`)}
              />
            ))}
          </div>
          <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Only projects owned by this wallet are shown. Create a project or connect an owner
            wallet if this list is empty.
          </p>
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

function ProjectCard({ project, onClick }: { project: OwnedProject; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl p-5 transition-all duration-200"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-blue)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px var(--brand-blue-glow)";
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
        <FolderLock className="size-4" style={{ color: "var(--brand-blue)" }} />
      </div>
      <p className="font-semibold text-slate-100 text-sm">{project.name}</p>
      <p className="text-xs font-mono mt-1.5" style={{ color: "var(--text-muted)" }}>
        Indexed from registry events
      </p>
      <div
        className="flex items-center justify-between mt-4 pt-4"
        style={{ borderTop: "1px solid var(--surface-border)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Project #{project.id.toString()}
        </span>
        <span
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: "var(--brand-blue)" }}
        >
          <ScrollText className="size-3.5" />
          View audit trail →
        </span>
      </div>
    </button>
  );
}
