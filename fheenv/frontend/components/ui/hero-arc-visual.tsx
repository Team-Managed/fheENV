"use client";
import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import gsap from "gsap";

// ── Arc geometry ──────────────────────────────────────────────────────────────
// ViewBox: "0 0 600 300" | Container: w-full × CONTAINER_H px
// Arc center: (300, 420) — below the viewBox, creates an upward dome
const CX = 300,
  CY = 420,
  R = 290;
const CONTAINER_H = 240;
const VB_H = 300;

function polar(angleDeg: number) {
  const r = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(r), y: CY - R * Math.sin(r) };
}

// Icons arranged along the arc
const ICONS = [
  { label: "Next.js", slug: "nextdotjs", hex: "ffffff", angle: 148 },
  { label: "GitHub", slug: "github", hex: "ffffff", angle: 118 },
  { label: "Ethereum", slug: "ethereum", hex: "627EEA", angle: 90 },
  { label: "Vercel", slug: "vercel", hex: "ffffff", angle: 62 },
  { label: "Docker", slug: "docker", hex: "2496ED", angle: 32 },
];

const ARC_START = polar(152);
const ARC_END = polar(28);
const ARC_D = `M ${ARC_START.x.toFixed(1)},${ARC_START.y.toFixed(1)} A ${R},${R} 0 0,1 ${ARC_END.x.toFixed(1)},${ARC_END.y.toFixed(1)}`;

export function HeroArcVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Draw arc path
      const path = arcRef.current;
      if (path) {
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 });
        gsap.to(path, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut", delay: 0.3 });
      }
      // Pop icons in after arc finishes drawing
      gsap.fromTo(
        ".arc-icon-card",
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.45, stagger: 0.12, delay: 1.5, ease: "back.out(2.2)" },
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden"
      style={{ height: CONTAINER_H }}
    >
      {/* ── SVG: glow, arc path, connecting lines, anchor dots ── */}
      <svg
        viewBox={`0 0 600 ${VB_H}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMax meet"
        aria-hidden
      >
        {/* Wide glow underneath the arc stroke */}
        <path d={ARC_D} fill="none" stroke="rgba(45,212,191,0.08)" strokeWidth={18} />

        {/* Medium glow */}
        <path d={ARC_D} fill="none" stroke="rgba(45,212,191,0.12)" strokeWidth={8} />

        {/* Animated draw arc (main visible stroke) */}
        <path
          ref={arcRef}
          d={ARC_D}
          fill="none"
          stroke="rgba(45,212,191,0.35)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0}
        />

        {/* Radial dashed lines from arc to icon centers */}
        {ICONS.map((ic) => {
          const p = polar(ic.angle);
          const inner = {
            x: CX + (R - 22) * Math.cos((ic.angle * Math.PI) / 180),
            y: CY - (R - 22) * Math.sin((ic.angle * Math.PI) / 180),
          };
          return (
            <line
              key={ic.label}
              x1={p.x}
              y1={p.y}
              x2={inner.x}
              y2={inner.y}
              stroke="rgba(45,212,191,0.18)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          );
        })}

        {/* Anchor dots on the arc */}
        {ICONS.map((ic) => {
          const p = polar(ic.angle);
          return (
            <g key={ic.label}>
              <circle cx={p.x} cy={p.y} r={7} fill="rgba(45,212,191,0.07)" />
              <circle cx={p.x} cy={p.y} r={3} fill="#2DD4BF" opacity={0.9} />
            </g>
          );
        })}
      </svg>

      {/* ── Icon cards — absolutely positioned via polar coords ── */}
      {ICONS.map((ic, i) => {
        const p = polar(ic.angle);
        const leftPct = (p.x / 600) * 100;
        const topPx = (p.y / VB_H) * CONTAINER_H;

        return (
          <div
            key={ic.label}
            className="arc-icon-card absolute"
            style={{
              left: `${leftPct}%`,
              top: topPx,
              transform: "translate(-50%, -88%)",
            }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut" }}
              className="flex flex-col items-center gap-1.5"
            >
              <motion.div
                whileHover={{ scale: 1.12 }}
                transition={{ duration: 0.18 }}
                className="w-12 h-12 rounded-xl flex items-center justify-center cursor-default"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://cdn.simpleicons.org/${ic.slug}/${ic.hex}`}
                  alt={ic.label}
                  className="w-6 h-6 object-contain"
                  draggable={false}
                />
              </motion.div>
              <span className="text-[9px] font-mono text-slate-600 whitespace-nowrap">
                {ic.label}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
