"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function CrimeTapeMarquee({
  text = "FHE SECURED /// ZERO-KNOWLEDGE /// END-TO-END ENCRYPTED /// NO PLAIN TEXT EXPOSED /// ",
  direction = "left",
  className = "",
}: {
  text?: string;
  direction?: "left" | "right";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!textRef.current) return;
    
    // Animate moving left or right continuously
    const xPercent = direction === "left" ? -50 : 0;
    const startPercent = direction === "left" ? 0 : -50;
    
    // Make sure we kill any existing tweens to avoid overlapping animations on HMR
    gsap.killTweensOf(textRef.current);

    gsap.fromTo(
      textRef.current,
      { xPercent: startPercent },
      { 
        xPercent: xPercent, 
        repeat: -1, 
        duration: 30, 
        ease: "none" 
      }
    );
  }, [direction]);

  const fullText = text.repeat(4);

  return (
    <div 
      ref={containerRef}
      className={`overflow-hidden whitespace-nowrap bg-brand-navy/40 text-brand-blue/50 font-black text-xs sm:text-sm tracking-[0.2em] py-1.5 flex shadow-2xl border-y border-brand-blue/20 backdrop-blur-sm ${className}`}
      style={{
        backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(110,172,218,0.05) 20px, rgba(110,172,218,0.05) 40px)",
      }}
    >
      <div ref={textRef} className="flex w-max">
        <span className="px-4">{fullText}</span>
        <span className="px-4">{fullText}</span>
      </div>
    </div>
  );
}
