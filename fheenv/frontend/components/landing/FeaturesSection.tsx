"use client";
import { useRef, useEffect } from "react";
import {
  Shield,
  EyeOff,
  WalletCards,
  RotateCcw,
  Users,
  HardDrive,
  Terminal,
  ShieldCheck,
  ExternalLink,
  LockKeyhole,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ------------------------------------------------------------------ */
/*  Audit Log (centerpiece)                                            */
/* ------------------------------------------------------------------ */

function AuditLogCard() {
  const events = [
    { time: "17:44:06", event: "env_pulled", wallet: "0x50BD..8B90", env: "production", detail: "–", color: "text-brand-blue" },
    { time: "17:44:13", event: "member_granted", wallet: "0x50BD..8B90", env: "production", detail: "→ 0xE36f…6176", color: "text-green-400" },
    { time: "17:44:30", event: "env_pulled", wallet: "0xE36f..6176", env: "production", detail: "–", color: "text-brand-blue" },
    { time: "17:44:50", event: "member_revoked", wallet: "0x50BD..8B90", env: "production", detail: "✗ 0xE36f…6176", color: "text-red-400" },
    { time: "17:45:29", event: "key_rotated", wallet: "0x50BD..8B90", env: "production", detail: "→ QmPSE4..pbE4 ✓ unpinned", color: "text-yellow-400" },
    { time: "17:45:49", event: "env_pulled", wallet: "0x50BD..8B90", env: "production", detail: "–", color: "text-brand-blue" },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-blue/10 border border-brand-blue/20">
            <ShieldCheck className="size-4 text-brand-blue" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">On-Chain Audit Log</h3>
            <p className="text-[10px] text-slate-400">Every action, permanently recorded</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#27c93f]">
          <span className="size-1.5 rounded-full bg-[#27c93f] shadow-[0_0_8px_#27c93f] animate-pulse" /> Live
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 rounded-xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden">
        <div className="grid grid-cols-[56px_1fr_1fr_70px_1fr] gap-1.5 px-4 py-2 border-b border-white/[0.04] text-[9px] font-mono font-bold tracking-wider text-brand-blue/40 uppercase">
          <span>Time</span><span>Event</span><span>Wallet</span><span>Env</span><span>Detail</span>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {events.map((e, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              viewport={{ once: true }}
              className="grid grid-cols-[56px_1fr_1fr_70px_1fr] gap-1.5 px-4 py-2 hover:bg-white/[0.02] transition-colors cursor-default group font-mono text-[10px]"
            >
              <span className="text-slate-500">{e.time}</span>
              <span className={`font-bold ${e.color}`}>{e.event}</span>
              <span className="text-cyan-400/60 group-hover:text-cyan-400 transition-colors">{e.wallet}</span>
              <span className="text-slate-500">{e.env}</span>
              <span className="text-slate-400 truncate">{e.detail}</span>
            </motion.div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
          <span className="text-[9px] text-slate-500 font-mono">Sepolia · Block #6,214,891</span>
          <div className="flex items-center gap-1 text-[9px] text-brand-blue/50 font-medium cursor-pointer hover:text-brand-blue transition-colors">
            <ExternalLink className="size-2.5" /> Etherscan
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bento card wrapper                                                 */
/* ------------------------------------------------------------------ */

function BentoCard({
  icon,
  title,
  description,
  children,
  className = "",
  iconColor = "text-brand-blue",
  glowColor = "rgba(110,172,218,0.06)",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
  iconColor?: string;
  glowColor?: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.015, y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`bento-card group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-md p-5 sm:p-6 transition-colors duration-300 hover:border-brand-blue/20 hover:bg-[#0d1117] cursor-default ${className}`}
    >
      {/* Hover glow */}
      <div
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: glowColor }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {icon}
          </div>
          <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-400 mb-3">{description}</p>
        {children}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Features Section                                                   */
/* ------------------------------------------------------------------ */

export function FeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray(".bento-card") as HTMLElement[];
      gsap.set(cards, { opacity: 0, y: 40, scale: 0.96 });

      gsap.to(cards, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="features" ref={sectionRef} className="py-28 bg-brand-ink overflow-hidden relative z-10">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-blue/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-blue/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="font-mono text-xs font-semibold tracking-widest text-brand-blue uppercase mb-4 flex items-center justify-center gap-2">
            <Shield className="size-3.5" /> Built different
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-slate-100 mb-4 leading-tight tracking-tight">
            Enterprise-grade security{" "}
            <span className="text-brand-blue">for your secrets</span>
          </h2>
          <p className="text-lg text-slate-400">
            Stop pasting .env files in Slack. Secure your secrets with the next generation of cryptographic privacy.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto auto-rows-auto">
          {/* Row 1: 3 cards */}
          <BentoCard
            icon={<EyeOff className="size-4 text-brand-blue" />}
            title="Zero-Trust"
            description="Your env vars are encrypted client-side with AES-256-GCM. We never see plaintext data or your keys."
            className="lg:col-span-1"
          >
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 font-mono text-[10px]">
              <LockKeyhole className="size-3 text-brand-blue/50" />
              <span className="text-slate-500">Encrypted at rest + in transit</span>
            </div>
          </BentoCard>

          <BentoCard
            icon={<Shield className="size-4 text-brand-blue" />}
            title="FHE Encryption"
            description="Access control computed directly on encrypted data via the Fhenix threshold network."
            className="lg:col-span-2"
            glowColor="rgba(110,172,218,0.08)"
          >
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { label: "Encrypt", status: "Client" },
                { label: "Compute", status: "On-chain" },
                { label: "Decrypt", status: "Threshold" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-center">
                  <div className="text-[10px] font-bold text-brand-blue">{s.label}</div>
                  <div className="text-[9px] text-slate-500">{s.status}</div>
                </div>
              ))}
            </div>
          </BentoCard>

          <BentoCard
            icon={<WalletCards className="size-4 text-brand-sand" />}
            title="Wallet Auth"
            description="Sign in with Ethereum. No emails, no passwords, no trusted third party."
            iconColor="text-brand-sand"
            glowColor="rgba(226,226,182,0.06)"
            className="lg:col-span-1"
          >
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 font-mono text-[10px]">
              <span className="text-cyan-400/70">0x50BD..8B90</span>
              <span className="ml-auto flex items-center gap-1 text-[#27c93f] text-[9px]">
                <span className="size-1.5 rounded-full bg-[#27c93f] shadow-[0_0_6px_#27c93f]" /> Connected
              </span>
            </div>
          </BentoCard>

          {/* Row 2: Audit Log (big, spans 2 cols + 2 rows) + 2 stacked cards */}
          <div className="bento-card lg:col-span-2 lg:row-span-2 rounded-2xl border border-brand-blue/15 bg-[#0d1117]/80 backdrop-blur-md p-5 sm:p-6 hover:border-brand-blue/30 transition-colors duration-300">
            <AuditLogCard />
          </div>

          <BentoCard
            icon={<RotateCcw className="size-4 text-yellow-400" />}
            title="Auto Key Rotation"
            description="On member revocation, keys rotate automatically. Old IPFS blobs are unpinned. Zero manual work."
            iconColor="text-yellow-400"
            glowColor="rgba(250,204,21,0.06)"
            className="lg:col-span-2"
          >
            <div className="space-y-1 font-mono text-[10px]">
              <div className="text-yellow-400">✓ key_rotated [team_remove]</div>
              <div className="text-slate-500">New CID: QmPSE4..pbE4</div>
              <div className="text-slate-500">✓ Previous blob unpinned</div>
            </div>
          </BentoCard>

          <BentoCard
            icon={<Users className="size-4 text-green-400" />}
            title="Team Access"
            description="Grant and revoke access by wallet address. Revoked members are cryptographically locked out."
            iconColor="text-green-400"
            glowColor="rgba(34,197,94,0.06)"
            className="lg:col-span-2"
          >
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="text-green-400">✓</span>
                <span className="text-slate-400">granted</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1.5">
                <span className="text-red-400">✗</span>
                <span className="text-slate-400">revoked</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1.5">
                <span className="text-yellow-400 font-bold">LOCKED OUT</span>
              </div>
            </div>
          </BentoCard>

          {/* Row 3: 3 cards */}
          <BentoCard
            icon={<HardDrive className="size-4 text-brand-blue" />}
            title="IPFS Storage"
            description="Encrypted blobs stored on IPFS with content-addressed CIDs. Decentralized, immutable, verifiable."
            className="lg:col-span-1"
          >
            <div className="font-mono text-[10px] text-slate-500 truncate">
              CID: QmPSE4yd8Ey6nAam...7TpbE4
            </div>
          </BentoCard>

          <BentoCard
            icon={<Terminal className="size-4 text-brand-blue" />}
            title="CLI-First DX"
            description="Push, pull, run — three commands. Inject secrets into processes without writing to disk."
            className="lg:col-span-2"
          >
            <div className="rounded-lg bg-[#0a0a0a] border border-white/[0.06] px-3 py-2 font-mono text-[10px]">
              <div><span className="text-green-400">~</span> <span className="text-brand-blue">$</span> <span className="text-slate-200">fheenv run -- node server.js</span></div>
              <div className="text-brand-sand mt-0.5">✓ 12 vars injected · running (no disk write)</div>
            </div>
          </BentoCard>

          <BentoCard
            icon={<Zap className="size-4 text-brand-sand" />}
            title="CI/CD Ready"
            description="Use FHEENV_PRIVATE_KEY env var in GitHub Actions — no keyfile, no MetaMask, fully automated."
            iconColor="text-brand-sand"
            glowColor="rgba(226,226,182,0.06)"
            className="lg:col-span-1"
          >
            <div className="rounded-lg bg-[#0a0a0a] border border-white/[0.06] px-3 py-2 font-mono text-[10px]">
              <div className="text-slate-400">FHEENV_PRIVATE_KEY=<span className="text-pink-400">$&#123;&#123; secrets.KEY &#125;&#125;</span></div>
              <div className="text-brand-sand mt-0.5">✓ fheenv pull --env production</div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
