"use client";
import { use } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { AuditLog } from "@/components/AuditLog";
import { ChevronRight, Terminal } from "lucide-react";

const ENVIRONMENTS = [
  {
    name: "development",
    label: "Development",
    dot: "#22c55e",
    badge: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  {
    name: "staging",
    label: "Staging",
    dot: "#eab308",
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
  {
    name: "production",
    label: "Production",
    dot: "#ef4444",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
  },
] as const;

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

      {/* Environments */}
      <div className="mb-10">
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Environments
        </p>
        <div className="space-y-2.5">
          {ENVIRONMENTS.map(({ name, label, dot, badge }) => (
            <Link
              key={name}
              href={`/project/${id}/env/${name}`}
              className="group flex items-center justify-between rounded-xl px-5 py-4 transition-all duration-200"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--surface-border)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--aqua)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px var(--aqua-glow)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-border)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ background: dot, boxShadow: `0 0 8px ${dot}88` }}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-200">{label}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${badge}`}>
                  {name}
                </span>
                <ChevronRight
                  className="size-4 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* CLI hint */}
      <div
        className="rounded-xl px-5 py-4 mb-10 flex items-start gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
      >
        <Terminal className="size-4 shrink-0 mt-0.5" style={{ color: "var(--aqua)" }} />
        <div>
          <p className="text-xs font-semibold text-slate-300 mb-1">CLI shortcut</p>
          <code className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            fheenv pull --env production &nbsp;·&nbsp; fheenv run --env production -- node app.js
          </code>
        </div>
      </div>

      {/* Audit Log */}
      <AuditLog projectId={projectId} />
    </>
  );
}
