"use client";
import React, { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, AnimatePresence } from "motion/react";
import {
  Apple,
  MonitorDot,
  Download,
  KeyRound,
  FolderOpen,
  Upload,
  Users,
  Play,
  Copy,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  OS Tab switcher                                                    */
/* ------------------------------------------------------------------ */

function OsTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all rounded-lg ${
        active
          ? "text-white bg-white/[0.08] border border-white/[0.1]"
          : "text-slate-400 hover:text-slate-200 border border-transparent"
      }`}
    >
      {icon}
      {label}
      {active && (
        <motion.div
          layoutId="os-indicator"
          className="absolute inset-0 rounded-lg border border-brand-blue/40 bg-brand-blue/5"
          style={{ zIndex: -1 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Code block with copy                                               */
/* ------------------------------------------------------------------ */

function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`group relative rounded-xl bg-[#0a0a0a] border border-white/[0.06] overflow-hidden ${className}`}
    >
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all opacity-100 sm:opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="p-4 overflow-x-hidden whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.8] text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step card                                                          */
/* ------------------------------------------------------------------ */

function StepCard({
  num,
  icon,
  title,
  description,
  children,
}: {
  num: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="hiw-step group"
    >
      <div className="flex items-start gap-5">
        {/* Step number + line */}
        <div className="flex flex-col items-center shrink-0">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-blue/10 border border-brand-blue/20 text-brand-blue font-mono text-sm font-bold group-hover:bg-brand-blue/20 group-hover:border-brand-blue/40 transition-colors">
            {num}
          </div>
          <div className="w-px flex-1 bg-gradient-to-b from-brand-blue/20 to-transparent mt-2 min-h-[40px]" />
        </div>

        {/* Content */}
        <div className="flex-1 pb-10">
          <div className="flex items-center gap-2 mb-1.5">
            {icon}
            <h3 className="text-lg font-bold text-white">{title}</h3>
          </div>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">{description}</p>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function HowItWorksSection() {
  const [os, setOs] = useState<"mac" | "windows">("mac");
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from(".hiw-header", {
        opacity: 0,
        y: 30,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: ".hiw-header", start: "top 85%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const installCmd =
    os === "mac"
      ? "curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash"
      : "irm https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.ps1 | iex";

  const verifyCmd =
    os === "mac"
      ? "source ~/.zshrc\nfheenv --version"
      : "# Open a new terminal, then:\nfheenv --version";

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative z-10 overflow-hidden bg-brand-ink pt-10 pb-0 text-slate-100 sm:pt-16"
    >
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-blue/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-blue/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div className="hiw-header text-center mb-16">
          <p className="font-mono text-xs font-semibold tracking-widest text-brand-blue uppercase mb-4">
            Get started
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-slate-100 tracking-tight">
            Start with <span className="text-brand-blue">the CLI.</span>
          </h2>
          <p className="text-slate-400 font-medium text-lg max-w-2xl mx-auto">
            Install fheENV, create a project, and push an environment.
          </p>
        </div>

        {/* OS Switcher */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <OsTab
            active={os === "mac"}
            onClick={() => setOs("mac")}
            icon={<Apple className="size-4" />}
            label="macOS / Linux"
          />
          <OsTab
            active={os === "windows"}
            onClick={() => setOs("windows")}
            icon={<MonitorDot className="size-4" />}
            label="Windows"
          />
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={os}
            initial={{ opacity: 0, x: os === "mac" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: os === "mac" ? 20 : -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 1: Install */}
            <StepCard
              num="01"
              icon={<Download className="size-4 text-brand-blue" />}
              title="Install fheenv"
              description={
                os === "mac"
                  ? "One command installs fheENV for macOS or Linux."
                  : "Run PowerShell as Administrator and execute the install script."
              }
            >
              <CodeBlock code={installCmd} />
              <div className="mt-3">
                <CodeBlock code={verifyCmd} />
              </div>
            </StepCard>

            {/* Step 2: Login */}
            <StepCard
              num="02"
              icon={<KeyRound className="size-4 text-brand-sand" />}
              title="Save your wallet"
              description="Enter your key in a hidden prompt. fheENV saves it locally with mode 0600."
            >
              <CodeBlock code="fheenv login" />
              <div className="mt-2 font-mono text-[10px] text-slate-500 flex items-center gap-2">
                <span className="text-green-400">✓</span> Saved to ~/.fheenv/wallet.json
                (permissions: 0600)
              </div>
            </StepCard>

            {/* Step 3: Init */}
            <StepCard
              num="03"
              icon={<FolderOpen className="size-4 text-brand-blue" />}
              title="Initialize a project"
              description="Create a project on-chain and write its public config to .fheenv.json."
            >
              <CodeBlock
                code={`cd my-app\nfheenv init \\\n  --name "my-app" \\\n  --registry 0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2 \\\n  --rpc https://sepolia.infura.io/v3/YOUR_KEY \\\n  --chain-id 11155111 \\\n  --pinata-jwt eyJ...`}
              />
            </StepCard>

            {/* Step 4: Push */}
            <StepCard
              num="04"
              icon={<Upload className="size-4 text-green-400" />}
              title="Push your secrets"
              description="Encrypt the file locally, store the blob on IPFS, and protect its key with FHE."
            >
              <CodeBlock code="fheenv push --env production" />
              <div className="mt-2 space-y-0.5 font-mono text-[10px]">
                <div className="text-slate-500">Generating AES key and encrypting env blob...</div>
                <div className="text-slate-500">Uploading encrypted blob to IPFS...</div>
                <div className="text-slate-500">
                  FHE-encrypting AES key via threshold network...
                </div>
                <div className="text-brand-sand">✓ Environment pushed! Version: 1</div>
              </div>
            </StepCard>

            {/* Step 5: Team */}
            <StepCard
              num="05"
              icon={<Users className="size-4 text-brand-blue" />}
              title="Add your team"
              description="Grant access to a wallet without sending the AES key."
            >
              <CodeBlock code="fheenv team add --member 0xTeammateAddress --env production" />
            </StepCard>

            {/* Step 6: Run */}
            <StepCard
              num="06"
              icon={<Play className="size-4 text-brand-sand" />}
              title="Pull or run"
              description="Write secrets to .env.local or inject them directly into a process."
            >
              <CodeBlock
                code={`# Write to disk\nfheenv pull --env production\n\n# Or inject into process (recommended)\nfheenv run --env production -- ${os === "windows" ? "npm start" : "node server.js"}`}
              />
              <div className="mt-2 font-mono text-[10px] text-brand-sand">
                ✓ 12 vars injected · server running (no disk write)
              </div>
            </StepCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
