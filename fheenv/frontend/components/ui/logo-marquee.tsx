"use client";
import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface LogoMarqueeProps {
  className?: string;
  items: React.ReactNode[];
  reverse?: boolean;
  duration?: number;
}

export function LogoMarquee({ className, items, reverse = false, duration = 25 }: LogoMarqueeProps) {
  return (
    <div className={cn("flex flex-col overflow-hidden w-32", className)} style={{ maskImage: "linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)" }}>
      <motion.div
        className="flex flex-col gap-6 pt-6"
        animate={{ y: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration }}
      >
        {/* Render twice for infinite effect */}
        {items.map((item, idx) => (
          <div key={`first-${idx}`} className="flex justify-center items-center h-32 w-32 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 shrink-0 transition-transform hover:scale-105">
            {item}
          </div>
        ))}
        {items.map((item, idx) => (
          <div key={`second-${idx}`} className="flex justify-center items-center h-32 w-32 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 shrink-0 transition-transform hover:scale-105">
            {item}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
