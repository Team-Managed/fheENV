"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { Dithering } from "@paper-design/shaders-react";
import { MorphingText } from "@/components/ui/morphing-text";
import { CrimeTapeMarquee } from "@/components/landing/CrimeTapeMarquee";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  ShieldCheck,
  Terminal,
} from "lucide-react";

export function HeroSection() {
  const pinSectionRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    const terminal = terminalRef.current;
    const pinSection = pinSectionRef.current;
    if (!terminal || !pinSection) return;

    const cliLines = terminal.querySelectorAll(".cli-line");
    if (cliLines.length === 0) return;

    // Hide all CLI lines initially
    gsap.set(cliLines, { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });

    const wrapper = terminal.parentElement;
    if (!wrapper) return;

    // Master timeline: pinned while terminal expands + lines type
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: pinSection,
        start: "top top",
        end: "+=2000",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
      },
    });

    // Phase 1: Remove wrapper padding so terminal can fill viewport
    tl.to(wrapper, {
      padding: 0,
      duration: 0.25,
      ease: "power2.inOut",
    }, 0);

    // Phase 1: Terminal expands to fill the viewport
    tl.to(terminal, {
      maxWidth: "100%",
      width: "100vw",
      height: "100vh",
      borderRadius: 0,
      borderColor: "transparent",
      boxShadow: "none",
      duration: 0.25,
      ease: "power2.inOut",
    }, 0);

    // Phase 2: Type in CLI lines — left to right wipe using clip-path
    // Use steps easing to simulate character-by-character typing
    tl.to(cliLines, {
      clipPath: "inset(0 0% 0 0)",
      stagger: 0.1,
      duration: 0.2,
      ease: "steps(40)",
    }, 0.15);

    return () => {
      tl.kill();
      ScrollTrigger.getAll().forEach(st => st.kill());
    };
  }, []);

  return (
    <>
      {/* Hero text section — scrolls normally */}
      <section className="relative overflow-hidden bg-brand-ink px-6 pb-12 pt-32 sm:pt-40">
        {/* Dithering background */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[620px] opacity-80"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 94%)",
            maskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 94%)",
          }}
          aria-hidden="true"
        >
          <Dithering
            colorFront="#6EACDA"
            colorBack="#03346E"
            shape="warp"
            type="4x4"
            size={2}
            scale={1.8}
            speed={0.22}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[620px] bg-brand-ink/25" aria-hidden="true" />

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 border border-brand-sand/30 bg-brand-ink/75 px-3 py-1.5 font-mono text-[10px] uppercase text-brand-sand backdrop-blur-sm mb-6">
              <ShieldCheck className="size-3.5" /> Encrypted locally · verified on-chain
            </div>

            <div className="flex flex-col items-center gap-2 sm:gap-4 pb-4">
              <MorphingText
                texts={["Zero-Trust", "Encrypted", "On-Chain", "Secure"]}
                className="text-[clamp(44px,7vw,88px)] font-semibold tracking-tighter text-brand-blue leading-[0.96]"
              />
              <h1 className="text-[clamp(44px,7vw,88px)] font-semibold leading-[0.96] text-slate-50 tracking-tight drop-shadow-sm">
                Environment Secrets.
              </h1>
            </div>

            <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-slate-300 font-medium sm:text-lg">
              Your <code className="font-mono text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded border border-brand-blue/20">.env</code>, encrypted
              with Fully Homomorphic Encryption. Push, pull, and run secrets — without ever exposing
              plaintext. <span className="text-slate-400">Not even us.</span>
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 bg-brand-blue px-6 text-sm font-semibold text-brand-ink transition-all hover:bg-brand-sand hover:shadow-[0_0_20px_rgba(226,226,182,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sand rounded-full"
              >
                Get Started <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-11 items-center gap-2 border border-brand-blue/40 bg-brand-ink/70 px-6 text-sm font-medium text-slate-100 backdrop-blur-sm transition-all hover:border-brand-sand/50 hover:text-brand-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sand rounded-full"
              >
                <Terminal className="size-3.5" /> See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pinned CLI section — sticks while terminal expands + types */}
      <section
        ref={pinSectionRef}
        className="relative z-50 bg-brand-ink overflow-hidden border-b border-brand-blue/20"
      >
        {/* Crime Scene Tapes */}
        <div className="absolute top-1/3 -left-[20%] w-[140%] -rotate-6 z-[5] opacity-50 mix-blend-screen pointer-events-none">
          <CrimeTapeMarquee direction="left" />
        </div>
        <div className="absolute bottom-1/4 -left-[20%] w-[140%] rotate-3 z-[5] opacity-50 mix-blend-screen pointer-events-none">
          <CrimeTapeMarquee direction="right" text="KEY ROTATION /// WALLET AUTH /// IPFS STORAGE /// ZERO PLAINTEXT /// THRESHOLD DECRYPTION /// " />
        </div>

        {/* Ambient glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />

        {/* Terminal — starts centered, animates to fill viewport */}
        <div className="relative z-10 flex items-center justify-center min-h-screen p-6 sm:p-10 will-change-[padding]">
          <div
            ref={terminalRef}
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a] shadow-[0_0_80px_rgba(110,172,218,0.08)] flex flex-col will-change-[max-width,width,height,border-radius]"
          >
            {/* Terminal Header */}
            <div className="flex h-10 shrink-0 items-center border-b border-white/[0.06] bg-[#111] px-4">
              <div className="flex gap-2">
                <div className="size-3 rounded-full bg-[#ff5f56]" />
                <div className="size-3 rounded-full bg-[#ffbd2e]" />
                <div className="size-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="mx-auto flex h-6 items-center justify-center gap-2 rounded-md px-3 text-[11px] text-slate-500 font-mono">
                <Terminal className="size-3" /> macbook:~
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 overflow-auto p-6 sm:p-8 font-mono text-[12px] sm:text-[13px] leading-[1.8] text-slate-300">
              {/* Pull Wallet B */}
              <div className="cli-line w-full break-words text-brand-blue font-bold">
                === Pull Wallet B ===
              </div>
              <div className="cli-line w-full break-words text-green-400">
                Passphrase to encrypt keyfile (blank = skip):
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-green-400">✓</span>{" "}
                <span className="text-slate-200">Wallet saved to ~/.fheenv/wallet.json</span>{" "}
                <span className="text-slate-500">(mode 0600, unencrypted)</span>
              </div>
              <div className="cli-line w-full break-words text-slate-400 pl-3">
                Tip: re-run `fheenv login` with a passphrase to encrypt keyfile at rest.
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-green-400">✓</span>{" "}
                <span className="text-slate-200">Decrypted env written to .env.local</span>{" "}
                <span className="text-slate-500">(permissions: 0600)</span>
              </div>
              <div className="cli-line w-full break-words pl-3 text-slate-400">
                Version: 3 | Updated: 2026-07-09T17:43:48.000Z
              </div>
              <div className="cli-line w-full break-words text-slate-200">
                DB_PASSWORD=<span className="text-pink-400">supersecret</span>
              </div>
              <div className="cli-line w-full break-words text-slate-200">
                API_KEY=<span className="text-pink-400">abc123</span>
              </div>

              <div className="cli-line w-full break-words h-4" />

              {/* Remove Wallet B */}
              <div className="cli-line w-full break-words text-brand-blue font-bold">
                === Remove Wallet B ===
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-yellow-400">⚠</span>{" "}
                <span className="text-yellow-400/90">Keyfile is unencrypted. Re-run `fheenv login` with a passphrase to encrypt it.</span>
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-green-400">✓</span>{" "}
                <span className="text-slate-200">Access revoked for <span className="text-cyan-400">0xE36f...6176</span> from env &quot;production&quot;</span>
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-green-400">✓</span>{" "}
                <span className="text-slate-200">Rotation complete (v4) – <span className="text-cyan-400">0xE36f...6176</span> cryptographically locked out</span>
              </div>
              <div className="cli-line w-full break-words pl-3 text-slate-400">
                New IPFS CID  : <span className="text-slate-300">QmPSE4yd8Ey6nAamRt3vZ9T6jLljsoL9omus5d5f7TpbE4</span>
              </div>
              <div className="cli-line w-full break-words pl-3 text-slate-400">
                Previous CID  : <span className="text-slate-300">QmYvQ14NyFXHoefYAAUUEoDRCFM9BheUWsW3fma8ENd4BC</span>
              </div>
              <div className="cli-line w-full break-words pl-3 text-slate-400">
                Re-granted    : <span className="text-slate-300">none</span>
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-green-400">✓</span>{" "}
                <span className="text-slate-200">Previous blob unpinned: <span className="text-slate-400">QmYvQ14NyF...ENd4BC</span></span>
              </div>

              <div className="cli-line w-full break-words h-4" />

              {/* Wallet B locked out */}
              <div className="cli-line w-full break-words text-brand-blue font-bold">
                === Wallet B locked out ===
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-red-400 font-bold">✗ Pull failed</span>
              </div>
              <div className="cli-line w-full break-words text-red-400">
                Error: sealOutput request failed: permit_denied
              </div>
              <div className="cli-line w-full break-words text-yellow-400 font-bold text-base">
                LOCKED OUT ✓
              </div>

              <div className="cli-line w-full break-words h-4" />

              {/* Wallet A still works */}
              <div className="cli-line w-full break-words text-brand-blue font-bold">
                === Wallet A still works ===
              </div>
              <div className="cli-line w-full break-words">
                <span className="text-green-400">✓</span>{" "}
                <span className="text-slate-200">Decrypted env written to .env.local</span>{" "}
                <span className="text-slate-500">(permissions: 0600)</span>
              </div>

              <div className="cli-line w-full break-words h-4" />

              <div className="cli-line w-full break-words flex items-center gap-1.5">
                <span className="text-green-400 font-semibold">~/fheENV</span>
                <span className="text-brand-blue">$</span>
                <span className="inline-block w-2 h-4 rounded-sm animate-pulse bg-brand-blue/60" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tag line */}
        <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center gap-x-8 gap-y-2 flex-wrap font-mono text-[10px] uppercase text-slate-500 pointer-events-none">
          <span>AES-256-GCM client-side</span>
          <span>FHE access control</span>
          <span>Automatic key rotation</span>
          <span>IPFS blob storage</span>
        </div>
      </section>
    </>
  );
}
