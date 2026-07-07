"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";

// ─── Left pane: plaintext .env ───────────────────────────────────────────────
const PlaintextEnv = () => (
  <motion.div
    key="plain"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.4 }}
    className="font-mono text-[11px] sm:text-xs leading-[1.9] select-none"
  >
    <div className="text-slate-600 mb-3 font-medium"># .env.production — Local Secrets</div>
    {[
      { key: "DATABASE_URL", val: "postgres://user:pass@localhost:5432/db" },
      { key: "NEXT_PUBLIC_API_KEY", val: "pk_live_123456789abcdef" },
      { key: "OPENAI_API_KEY", val: "sk-proj-987654321xyzabc" },
      { key: "STRIPE_SECRET_KEY", val: "sk_live_AbCdEfGhIjKlMnOp" },
    ].map(({ key, val }) => (
      <div key={key} className="flex flex-wrap gap-x-0.5">
        <span style={{ color: "#2DD4BF" }}>{key}</span>
        <span className="text-slate-500">=</span>
        <span className="text-slate-300">{val}</span>
      </div>
    ))}
  </motion.div>
);

// ─── Left pane: FHE-encrypted .env ───────────────────────────────────────────
const EncryptedEnv = () => (
  <motion.div
    key="encrypted"
    initial={{ opacity: 0, filter: "blur(8px)" }}
    animate={{ opacity: 1, filter: "blur(0px)" }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.7 }}
    className="font-mono text-[11px] sm:text-xs leading-[1.9] select-none"
  >
    <div className="text-slate-600 mb-3 font-medium">
      # .env.production — FHE Encrypted Vault 🔒
    </div>
    {[
      { key: "DATABASE_URL", val: "0x8f2a4b9c7d3e1f5a…" },
      { key: "NEXT_PUBLIC_API_KEY", val: "0x1a2b3c4d5e6f7a8b…" },
      { key: "OPENAI_API_KEY", val: "0xf1e2d3c4b5a69788…" },
      { key: "STRIPE_SECRET_KEY", val: "0x9a8b7c6d5e4f3a2b…" },
    ].map(({ key, val }) => (
      <div key={key} className="flex flex-wrap gap-x-0.5">
        <span style={{ color: "#2DD4BF" }}>{key}</span>
        <span className="text-slate-500">=</span>
        <span className="text-slate-600">{val}</span>
      </div>
    ))}
    <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-aqua/70 border border-aqua/20 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-aqua/70 animate-pulse" />
      FHE encrypted · On-chain
    </div>
  </motion.div>
);

// ─── Blinking cursor ──────────────────────────────────────────────────────────
const Cursor = () => (
  <motion.span
    animate={{ opacity: [1, 0] }}
    transition={{ repeat: Infinity, duration: 0.7 }}
    className="inline-block w-[7px] h-[14px] bg-aqua/70 rounded-sm ml-0.5 align-middle"
  />
);

// ─── Terminal prompt line ─────────────────────────────────────────────────────
function PromptLine({ cmd, show, done }: { cmd: string; show: boolean; done: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] sm:text-xs">
      <span className="font-bold select-none" style={{ color: "#2DD4BF" }}>
        ~/project ➜
      </span>
      <motion.span
        initial={{ width: 0 }}
        animate={{ width: "auto" }}
        transition={{ duration: 0.35, ease: "linear" }}
        className="overflow-hidden whitespace-nowrap inline-block text-slate-200"
      >
        {cmd}
      </motion.span>
      {!done && <Cursor />}
    </div>
  );
}

// ─── Output lines ─────────────────────────────────────────────────────────────
function OutputLine({
  children,
  show,
  success,
  delay = 0,
}: {
  children: React.ReactNode;
  show: boolean;
  success?: boolean;
  delay?: number;
}) {
  if (!show) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.2 }}
      className={cn(
        "font-mono text-[11px] sm:text-xs pl-1",
        success ? "text-green-400 font-medium" : "text-slate-400",
      )}
    >
      {children}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HeroDeviceMockup({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let alive = true;
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    (async () => {
      await wait(400);
      if (!alive) return;
      setStep(1); // type "fheenv create"
      await wait(700);
      if (!alive) return;
      setStep(2); // create done
      await wait(800);
      if (!alive) return;
      setStep(3); // type "fheenv push"
      await wait(800);
      if (!alive) return;
      setStep(4); // encrypting…
      await wait(1400);
      if (!alive) return;
      setStep(5); // type "fheenv pull"
      await wait(800);
      if (!alive) return;
      setStep(6); // decrypting…
      await wait(3500);
      if (!alive) return;
      setStep(0); // reset
    })();
    return () => {
      alive = false;
    };
  }, [step]);

  return (
    <div
      className={cn(
        "relative w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col",
        "border border-white/[0.06] bg-[#0d1117]",
        "shadow-[0_32px_64px_-16px_rgba(45,212,191,0.12),0_0_0_1px_rgba(45,212,191,0.06)]",
        "hover:border-aqua/25 transition-colors duration-500",
        className,
      )}
    >
      {/* macOS titlebar */}
      <div className="flex items-center px-4 py-3 bg-[#161b22] border-b border-white/[0.06] shrink-0 relative">
        <div className="flex gap-2 absolute">
          <div className="w-3 h-3 rounded-full bg-red-400/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/70" />
          <div className="w-3 h-3 rounded-full bg-green-400/70" />
        </div>
        <div className="mx-auto flex items-center gap-2 text-xs text-slate-500 font-mono">
          <Terminal className="size-3" />
          fheenv-cli
        </div>
      </div>

      {/* Split body */}
      <div className="flex flex-col md:flex-row h-[500px] md:h-[440px]">
        {/* ── Left: .env file pane ── */}
        <div className="w-full md:w-[42%] bg-[#0d1117] border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-col shrink-0">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500">.env.production</span>
          </div>
          <div className="p-4 overflow-hidden">
            <AnimatePresence mode="wait">
              {step < 4 || step >= 6 ? (
                <PlaintextEnv key="plain" />
              ) : (
                <EncryptedEnv key="encrypted" />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right: terminal pane ── */}
        <div className="flex-1 bg-[#0d1117] flex flex-col">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500">bash</span>
          </div>
          <div className="p-4 flex flex-col gap-1.5 overflow-y-auto">
            {/* idle cursor */}
            {step === 0 && (
              <div className="flex items-center gap-1.5 font-mono text-[11px] sm:text-xs">
                <span className="font-bold" style={{ color: "#2DD4BF" }}>
                  ~/project ➜
                </span>
                <Cursor />
              </div>
            )}

            {/* ── fheenv create ── */}
            <PromptLine cmd="fheenv create" show={step >= 1} done={step >= 2} />
            <OutputLine show={step >= 2} delay={0.1}>
              Initializing zero-trust vault…
            </OutputLine>
            <OutputLine show={step >= 2} success delay={0.3}>
              ✔ Vault created · On-chain registry linked.
            </OutputLine>

            {/* ── fheenv push ── */}
            {step >= 3 && <div className="pt-1.5" />}
            <PromptLine cmd="fheenv push .env.production" show={step >= 3} done={step >= 4} />
            <OutputLine show={step >= 4} delay={0.1}>
              Encrypting 14 variables with FHE…
            </OutputLine>
            <OutputLine show={step >= 4} delay={0.35}>
              Syncing with smart contract…
            </OutputLine>
            <OutputLine show={step >= 4} success delay={0.6}>
              ✔ Secrets pushed to on-chain registry.
            </OutputLine>

            {/* ── fheenv run ── */}
            {step >= 5 && <div className="pt-1.5" />}
            <PromptLine cmd="fheenv pull" show={step >= 5} done={step >= 6} />
            <OutputLine show={step >= 6} delay={0.1}>
              Fetching encrypted vars from registry…
            </OutputLine>
            <OutputLine show={step >= 6} delay={0.3}>
              Decrypting via FHE locally…
            </OutputLine>
            <OutputLine show={step >= 6} success delay={0.55}>
              ✔ Variables injected into environment.
            </OutputLine>

            {/* trailing prompt */}
            {step >= 6 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="flex items-center gap-1.5 font-mono text-[11px] pt-1.5"
              >
                <span className="font-bold" style={{ color: "#2DD4BF" }}>
                  ~/project
                </span>
                <span className="text-slate-500">➜</span>
                <Cursor />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
