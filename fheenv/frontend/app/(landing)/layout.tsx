"use client";
import { Dithering } from "@paper-design/shaders-react";
import React from "react";

const MemoizedDithering = React.memo(Dithering);

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#030712] text-slate-100 min-h-screen font-sans antialiased selection:bg-aqua/30 selection:text-aqua overflow-x-hidden relative">
      {/* Dithering — fixed full-viewport, behind everything */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-50">
        <MemoizedDithering
          colorFront="#2DD4BF"
          colorBack="#030712"
          shape="swirl"
          type="4x4"
          size={2}
          scale={2.5}
          speed={0.4}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>

      {/* Page content sits above the shader */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
