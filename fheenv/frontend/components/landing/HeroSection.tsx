"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { Dithering } from "@paper-design/shaders-react";
import { MorphingText } from "@/components/ui/morphing-text";
import { CrimeTapeMarquee } from "@/components/landing/CrimeTapeMarquee";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ShieldCheck, Terminal } from "lucide-react";

export function HeroSection() {
  const pinSectionRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const terminalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

    const terminal = terminalRef.current;
    const terminalBody = terminalBodyRef.current;
    const terminalContent = terminalContentRef.current;
    const pinSection = pinSectionRef.current;
    if (!terminal || !terminalBody || !terminalContent || !pinSection) return;

    const cliLines = terminal.querySelectorAll(".cli-line");
    if (cliLines.length === 0) return;

    const wrapper = terminal.parentElement;
    if (!wrapper) return;

    const navbar = document.querySelector<HTMLElement>("[data-site-navbar]");
    const terminalCaption = pinSection.querySelector<HTMLElement>("[data-terminal-caption]");
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(cliLines, { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });

      const setNavbarVisible = (visible: boolean) => {
        if (!navbar) return;
        navbar.style.pointerEvents = visible ? "" : "none";
        gsap.to(navbar, {
          autoAlpha: visible ? 1 : 0,
          y: visible ? 0 : -16,
          duration: 0.2,
          overwrite: true,
        });
      };

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: pinSection,
          start: "top top",
          end: "+=2000",
          pin: true,
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onEnter: () => setNavbarVisible(false),
          onEnterBack: () => setNavbarVisible(false),
          onLeave: () => setNavbarVisible(true),
          onLeaveBack: () => setNavbarVisible(true),
        },
      });

      timeline.to(
        wrapper,
        {
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          duration: 0.25,
          ease: "none",
        },
        0,
      );

      if (terminalCaption) {
        timeline.to(
          terminalCaption,
          {
            autoAlpha: 0,
            duration: 0.1,
            ease: "none",
          },
          0,
        );
      }

      timeline.to(
        terminal,
        {
          maxWidth: "100%",
          width: "100%",
          height: "100svh",
          minHeight: 0,
          borderRadius: 0,
          borderColor: "transparent",
          boxShadow: "none",
          duration: 0.25,
          ease: "none",
        },
        0,
      );

      timeline.to(
        terminalBody,
        {
          maxHeight: "calc(100svh - 40px)",
          duration: 0.25,
          ease: "none",
        },
        0,
      );

      timeline.to(
        cliLines,
        {
          clipPath: "inset(0 0% 0 0)",
          stagger: 0.1,
          duration: 0.2,
          ease: "steps(40)",
        },
        0.15,
      );

      timeline.to(
        terminalContent,
        {
          y: () => -Math.max(0, terminalContent.scrollHeight - terminalBody.clientHeight + 64),
          duration: 0.45,
          ease: "none",
        },
        0.55,
      );

      return () => {
        timeline.kill();
        if (navbar) {
          gsap.killTweensOf(navbar);
          gsap.set(navbar, { clearProps: "opacity,transform,visibility" });
          navbar.style.pointerEvents = "";
        }
      };
    });

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(cliLines, { clearProps: "transform,visibility,opacity,clipPath" });
      gsap.set([wrapper, terminal], { clearProps: "all" });
    });

    let active = true;
    const refresh = () => {
      if (active) ScrollTrigger.refresh();
    };
    const refreshFrame = window.requestAnimationFrame(refresh);
    document.fonts.ready.then(refresh);
    window.addEventListener("load", refresh);

    return () => {
      active = false;
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener("load", refresh);
      media.revert();
    };
  }, []);

  return (
    <>
      {/* Hero text section scrolls normally */}
      <section className="relative overflow-hidden bg-brand-ink px-4 pb-4 pt-24 sm:px-6 sm:pt-40">
        {/* Dithering background */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[620px] opacity-35 sm:opacity-60"
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

        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[620px] bg-brand-ink/50 sm:bg-brand-ink/35"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 border border-brand-sand/30 bg-brand-ink/75 px-3 py-1.5 font-mono text-[10px] uppercase text-brand-sand backdrop-blur-sm mb-6">
              <ShieldCheck className="size-3.5" /> Encrypted locally · verified on-chain
            </div>

            <div className="flex flex-col items-center gap-2 pb-4 sm:gap-4">
              <MorphingText
                texts={["Zero-Trust", "Encrypted", "On-Chain", "Secure"]}
                className="text-[32px] font-semibold leading-none tracking-tighter text-brand-blue min-[360px]:text-[36px] sm:text-[clamp(44px,7vw,88px)] sm:leading-[0.96]"
              />
              <h1 className="max-w-full text-[36px] font-semibold leading-[1.02] tracking-tight text-slate-50 drop-shadow-sm max-[359px]:text-[32px] sm:text-[clamp(44px,7vw,88px)] sm:leading-[0.96]">
                Environment Secrets.
              </h1>
            </div>

            <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-slate-300 font-medium sm:text-lg">
              Your{" "}
              <code className="font-mono text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded border border-brand-blue/20">
                .env
              </code>
              , encrypted before it leaves your machine. Push, pull, and run secrets without
              exposing plaintext. <span className="text-slate-400">fheENV cannot read it.</span>
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard"
                className="inline-flex h-11 w-full max-w-60 items-center justify-center gap-2 rounded-full bg-brand-blue px-6 text-sm font-semibold text-brand-ink transition-all hover:bg-brand-sand hover:shadow-[0_0_20px_rgba(226,226,182,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sand sm:w-auto"
              >
                Get Started <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-11 w-full max-w-60 items-center justify-center gap-2 rounded-full border border-brand-blue/40 bg-brand-ink/70 px-6 text-sm font-medium text-slate-100 backdrop-blur-sm transition-all hover:border-brand-sand/50 hover:text-brand-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sand sm:w-auto"
              >
                <Terminal className="size-3.5" /> See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pinned CLI section sticks while terminal expands and types */}
      <section
        ref={pinSectionRef}
        className="relative z-50 min-h-[100svh] overflow-hidden border-b border-brand-blue/20 bg-brand-ink"
      >
        {/* Crime Scene Tapes */}
        <div className="absolute top-1/3 -left-[20%] z-[5] hidden w-[140%] -rotate-6 opacity-50 mix-blend-screen pointer-events-none md:block">
          <CrimeTapeMarquee direction="left" />
        </div>
        <div className="absolute bottom-1/4 -left-[20%] z-[5] hidden w-[140%] rotate-3 opacity-50 mix-blend-screen pointer-events-none md:block">
          <CrimeTapeMarquee
            direction="right"
            text="KEY ROTATION /// WALLET AUTH /// IPFS STORAGE /// ZERO PLAINTEXT /// THRESHOLD DECRYPTION /// "
          />
        </div>

        {/* Ambient glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />

        {/* Terminal starts centered, then fills the viewport */}
        <div className="relative z-10 flex min-h-[100svh] items-start justify-center px-4 pt-0 pb-0 will-change-[padding] sm:px-10">
          <div
            ref={terminalRef}
            className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0a] shadow-[0_0_80px_rgba(110,172,218,0.08)] will-change-[max-width,width,height,border-radius] md:rounded-2xl"
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
            <div
              ref={terminalBodyRef}
              className="max-h-[520px] flex-1 overflow-hidden p-4 font-mono text-[11px] leading-[1.75] text-slate-300 sm:p-8 sm:text-[13px]"
            >
              <div ref={terminalContentRef} className="pb-16 will-change-transform">
                {/* Pull Wallet B */}
                <div className="cli-line w-full break-words text-brand-blue font-bold">
                  === Pull Wallet B ===
                </div>
                <div className="cli-line w-full break-words text-green-400">
                  Private key (input hidden):
                </div>
                <div className="cli-line w-full break-words">
                  <span className="text-green-400">✓</span>{" "}
                  <span className="text-slate-200">Wallet saved to ~/.fheenv/wallet.json</span>{" "}
                  <span className="text-slate-500">(mode 0600, unencrypted)</span>
                </div>
                <div className="cli-line w-full break-words text-slate-400 pl-3">
                  Keep this file private. It contains your signing key.
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
                  <span className="text-yellow-400/90">
                    Rotate this environment to replace its current key.
                  </span>
                </div>
                <div className="cli-line w-full break-words">
                  <span className="text-green-400">✓</span>{" "}
                  <span className="text-slate-200">
                    Access revoked for <span className="text-cyan-400">0xE36f...6176</span> from env
                    &quot;production&quot;
                  </span>
                </div>
                <div className="cli-line w-full break-words">
                  <span className="text-brand-blue">$</span>{" "}
                  <span className="text-slate-200">fheenv rotate --env production</span>
                </div>
                <div className="cli-line w-full break-words">
                  <span className="text-green-400">✓</span>{" "}
                  <span className="text-slate-200">Rotation complete (v4)</span>
                </div>
                <div className="cli-line w-full break-words pl-3 text-slate-400">
                  New IPFS CID :{" "}
                  <span className="text-slate-300">
                    QmPSE4yd8Ey6nAamRt3vZ9T6jLljsoL9omus5d5f7TpbE4
                  </span>
                </div>
                <div className="cli-line w-full break-words pl-3 text-slate-400">
                  Previous CID :{" "}
                  <span className="text-slate-300">
                    QmYvQ14NyFXHoefYAAUUEoDRCFM9BheUWsW3fma8ENd4BC
                  </span>
                </div>
                <div className="cli-line w-full break-words pl-3 text-slate-400">
                  Re-granted : <span className="text-slate-300">none</span>
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
        </div>

        {/* Bottom tag line */}
        <div
          data-terminal-caption
          className="absolute inset-x-0 bottom-0 z-20 flex min-h-16 flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-brand-blue/15 bg-brand-ink/95 px-4 py-3 font-mono text-[9px] uppercase text-slate-500 backdrop-blur-sm pointer-events-none md:bottom-6 md:min-h-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:text-[10px] md:backdrop-blur-none"
        >
          <span>AES-256-GCM client-side</span>
          <span>FHE access control</span>
          <span>Explicit key rotation</span>
          <span>IPFS blob storage</span>
        </div>
      </section>
    </>
  );
}
