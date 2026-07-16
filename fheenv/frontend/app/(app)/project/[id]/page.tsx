"use client";
import { use } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { AuditLog } from "@/components/AuditLog";
import { ChevronRight } from "lucide-react";

type Props = { params: Promise<{ id: string }> };

export default function ProjectPage({ params }: Props) {
  const { id } = use(params);
  const projectId = BigInt(id);

  type ProjectTuple = readonly [string, string, bigint, boolean];
  const { data: raw, isLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "projects",
    args: [projectId],
    chainId: 11155111,
  });
  const project = raw as unknown as ProjectTuple | undefined;

  return (
    <>
      {/* Breadcrumb */}
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

      {/* Project header */}
      {project && project[3] && (
        <div className="mb-10 pb-8" style={{ borderBottom: "1px solid var(--surface-border)" }}>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">{project[0]}</h1>
          <p className="text-xs font-mono mt-2" style={{ color: "var(--text-muted)" }}>
            Owner:{" "}
            <span className="text-slate-300">
              {project[1].slice(0, 10)}…{project[1].slice(-8)}
            </span>
          </p>
        </div>
      )}

      {/* Audit Log */}
      <AuditLog projectId={projectId} />
    </>
  );
}
