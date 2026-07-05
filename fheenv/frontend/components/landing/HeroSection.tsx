"use client";
import React, { useRef, useEffect } from "react";
import gsap from "gsap";
import { MorphingText } from "@/components/ui/morphing-text";
import { HeroDeviceMockup } from "@/components/ui/hero-device-mockup";
import { HeroArcVisual } from "@/components/ui/hero-arc-visual";
import { Globe, Lock, Shield, Terminal } from "lucide-react";
import Link from "next/link";

const morphTexts = ["Zero-Trust", "Encrypted", "On-Chain", "Secure"];

export function HeroSection() {
  const heroRef     = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;

    const items = el.querySelectorAll(".hero-el");
    gsap.set(items, { opacity: 0, y: 22 });
    gsap.to(items, { opacity: 1, y: 0, duration: 0.85, stagger: 0.1, ease: "power3.out", delay: 0.2 });

    const right = rightColRef.current;
    if (right) {
      gsap.set(right, { opacity: 0, scale: 0.95 });
      gsap.to(right, { opacity: 1, scale: 1, duration: 1.3, ease: "back.out(1.05)", delay: 0.5 });
    }

    // Mouse parallax on right column
    const onMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth  - 0.5) * 14;
      const y = (e.clientY / innerHeight - 0.5) * 8;
      if (right) gsap.to(right, { x, y, duration: 1.2, ease: "power2.out" });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div ref={heroRef} className="relative w-full overflow-hidden pt-8">
      {/* Stronger local dithering glow on hero right side — layered on top of layout's ambient */}
      <div className="absolute right-0 top-0 w-[60%] h-full pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-l from-aqua/[0.04] via-transparent to-transparent" />
      </div>

      {/* Hero grid */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-20 grid lg:grid-cols-2 gap-14 items-start">

        {/* ── Left: text ── */}
        <div className="flex flex-col gap-7 lg:pt-24">

          <div className="hero-el text-center lg:text-left flex flex-col gap-2 sm:gap-4 pb-4">
            <MorphingText
              texts={morphTexts}
              className="font-bold tracking-tighter"
              style={{ 
                fontSize: "clamp(42px, 5.5vw, 82px)",
                color: "#2DD4BF"
              } as React.CSSProperties}
            />
            <p 
              className="font-bold text-slate-100 leading-[1.1] tracking-tight drop-shadow-sm"
              style={{ fontSize: "clamp(42px, 5.5vw, 82px)" }}
            >
              Environment Secrets.
            </p>
          </div>

          <p className="hero-el text-center lg:text-left text-[15.5px] text-slate-300 max-w-[440px] mx-auto lg:mx-0 leading-relaxed font-medium drop-shadow-md">
            Your <code className="font-mono text-aqua bg-aqua/10 px-1 py-0.5 rounded border border-aqua/20">.env</code>, encrypted
            with Fully Homomorphic Encryption. Push, pull, and run secrets — without ever exposing
            plaintext. <span className="text-slate-400">Not even us.</span>
          </p>

          <div className="hero-el flex flex-wrap gap-3 justify-center lg:justify-start">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 font-bold px-6 py-2.5 rounded-full text-sm transition-all"
              style={{
                background: "#2DD4BF",
                color: "#030712",
                boxShadow: "0 0 28px rgba(45,212,191,0.30)",
              }}
            >
              Get Started →
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-2 border border-white/10 hover:border-white/20 bg-white/[0.04] backdrop-blur-sm text-slate-200 font-medium px-6 py-2.5 rounded-full text-sm transition-all"
            >
              See how it works
            </Link>
          </div>

          <div className="hero-el flex flex-wrap gap-2.5 justify-center lg:justify-start">
            {[
              { icon: Globe,    label: "Web3 Ready"  },
              { icon: Lock,     label: "FHE Secured" },
              { icon: Terminal, label: "CLI App"      },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 border border-white/[0.08] bg-white/[0.03] backdrop-blur-md rounded-full px-3 py-1.5 font-mono text-[11px] text-slate-300 shadow-sm"
              >
                <Icon className="size-3" style={{ color: "#2DD4BF" }} />
                {label}
              </span>
            ))}
          </div>

          {/* Mobile: mockup below text */}
          <div className="hero-el mt-2 w-full lg:hidden">
            <HeroDeviceMockup className="w-full" />
          </div>
        </div>

        {/* ── Right: Arc + Mockup ── */}
        <div ref={rightColRef} className="hidden lg:flex flex-col items-stretch gap-0 relative -mt-4">
          {/* The arc visual sits on top, overlapping the mockup */}
          <HeroArcVisual />

          {/* Device mockup — pulled up to overlap arc bottom */}
          <div className="-mt-16 relative z-10">
            <HeroDeviceMockup className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
