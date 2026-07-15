"use client";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Terminal, Apple, Monitor, Copy, Check, Download } from "lucide-react";

type Platform = "mac" | "linux" | "windows";

const INSTALL_COMMANDS: Record<
  Platform,
  { label: string; command: string; icon: React.ReactNode }
> = {
  mac: {
    label: "macOS / Linux",
    command:
      "curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash",
    icon: <Terminal className="size-3.5" />,
  },
  linux: {
    label: "macOS / Linux",
    command:
      "curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash",
    icon: <Terminal className="size-3.5" />,
  },
  windows: {
    label: "Windows (PowerShell)",
    command: "irm https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.ps1 | iex",
    icon: <Monitor className="size-3.5" />,
  },
};

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "mac";
}

export function InstallSection() {
  const [platform, setPlatform] = useState<Platform>("mac");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const current = INSTALL_COMMANDS[platform];

  function handleCopy() {
    navigator.clipboard.writeText(current.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="py-16 relative">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-8 relative overflow-hidden"
        >
          {/* Glow accent */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-brand-blue/10 rounded-full blur-[60px] pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center">
                <Download className="size-5 text-brand-blue" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Install fheENV CLI</h3>
                <p className="text-xs text-slate-400">One command. Auto-detects your platform.</p>
              </div>
            </div>

            {/* Platform tabs */}
            <div className="flex gap-1 bg-white/[0.04] rounded-lg p-1 border border-white/[0.06]">
              {(["mac", "windows"] as Platform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    platform === p || (platform === "linux" && p === "mac")
                      ? "bg-brand-blue/15 text-brand-blue border border-brand-blue/25"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {p === "mac" ? "macOS / Linux" : "Windows"}
                </button>
              ))}
            </div>
          </div>

          {/* Command box */}
          <div className="relative group">
            <div className="flex items-center gap-3 rounded-xl bg-[#0d1117] border border-white/[0.06] px-5 py-4 font-mono text-sm overflow-x-auto group-hover:border-brand-blue/20 transition-colors">
              <span className="text-brand-blue shrink-0 select-none">{current.icon}</span>
              <code className="text-slate-200 whitespace-nowrap">{current.command}</code>
              <button
                onClick={handleCopy}
                className="ml-auto shrink-0 p-2 rounded-lg bg-white/[0.05] hover:bg-brand-blue/10 border border-white/[0.08] hover:border-brand-blue/25 transition-all"
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="size-4 text-green-400" />
                ) : (
                  <Copy className="size-4 text-slate-400 group-hover:text-slate-200" />
                )}
              </button>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-green-400/70" />
            Installs to <code className="text-slate-400">~/.fheenv/bin</code> · configures PATH
            automatically · no sudo required
          </p>
        </motion.div>
      </div>
    </section>
  );
}
