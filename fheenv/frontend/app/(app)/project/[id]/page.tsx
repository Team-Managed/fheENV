"use client";
import { use } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { AuditLog } from "@/components/AuditLog";
import { ArrowLeft, ChevronRight, FolderLock, LayoutDashboard, Loader2 } from "lucide-react";

type Props = { params: Promise<{ id: string }> };

export default function ProjectPage({ params }: Props) {
  const { id } = use(params);
  const projectId = BigInt(id);
  const { address } = useAccount();

  type ProjectTuple = readonly [string, string, bigint, boolean];
  const { data: raw, isLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "projects",
    args: [projectId],
    chainId: 11155111,
  });
  const project = raw as unknown as ProjectTuple | undefined;
  const { data: nextProjectId, isLoading: projectsLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "nextProjectId",
    chainId: 11155111,
  });
  const projectIds = Array.from({ length: Number(nextProjectId ?? 0) }, (_, index) =>
    BigInt(index),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>

        <div
          className="mt-5 rounded-lg border p-2"
          style={{ background: "var(--surface)", borderColor: "var(--surface-border)" }}
        >
          <div
            className="flex items-center gap-2 px-2 py-2 text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            <LayoutDashboard className="size-3.5" />
            Projects
          </div>
          <div className="mt-1 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {projectsLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                Loading projects
              </div>
            ) : (
              projectIds.map((candidateId) => (
                <ProjectNavItem
                  key={candidateId.toString()}
                  projectId={candidateId}
                  active={candidateId === projectId}
                  address={address}
                />
              ))
            )}
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        <nav
          className="flex items-center gap-1.5 text-sm mb-8"
          style={{ color: "var(--text-muted)" }}
        >
          <Link href="/dashboard" className="hover:text-slate-200 transition-colors">
            Projects
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-slate-200 font-medium">
            {isLoading ? "…" : (project?.[0] ?? `#${id}`)}
          </span>
        </nav>

        {project && project[3] && (
          <div className="mb-10 pb-8" style={{ borderBottom: "1px solid var(--surface-border)" }}>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">{project[0]}</h1>
            <p className="text-xs font-mono mt-2" style={{ color: "var(--text-muted)" }}>
              Owner:{" "}
              <span className="text-slate-300">
                {project[1].slice(0, 10)}…{project[1].slice(-8)}
              </span>
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
              On-chain audit evidence for Project #{projectId.toString()}.
            </p>
          </div>
        )}

        <AuditLog projectId={projectId} />
      </section>
    </div>
  );
}

function ProjectNavItem({
  projectId,
  active,
  address,
}: {
  projectId: bigint;
  active: boolean;
  address?: `0x${string}`;
}) {
  const { data: raw } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "projects",
    args: [projectId],
    chainId: 11155111,
  });
  const { data: isOwner } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "owners",
    args: [projectId, address ?? "0x0000000000000000000000000000000000000000"],
    chainId: 11155111,
    query: { enabled: Boolean(address) },
  });
  const project = raw as unknown as readonly [string, string, bigint, boolean] | undefined;

  if (!project?.[3] || (!active && !isOwner)) return null;

  return (
    <Link
      href={`/project/${projectId}`}
      aria-current={active ? "page" : undefined}
      className="flex min-w-40 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors lg:min-w-0"
      style={{
        background: active ? "rgba(45,212,191,0.1)" : "transparent",
        color: active ? "var(--brand-blue)" : "var(--text-muted)",
      }}
    >
      <FolderLock className="size-3.5 shrink-0" />
      <span className="truncate">{project[0]}</span>
    </Link>
  );
}
