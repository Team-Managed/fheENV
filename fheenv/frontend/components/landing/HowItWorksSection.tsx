"use client";
import React, { useRef, useEffect } from "react";
import { Tree } from "@/components/ui/file-tree";
import type { TreeViewElement } from "@/components/ui/file-tree";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Terminal, FolderLock } from "lucide-react";

const ELEMENTS: TreeViewElement[] = [
  {
    id: "project",
    isSelectable: true,
    name: "my-fhe-app",
    children: [
      {
        id: "src",
        isSelectable: true,
        name: "src",
        children: [{ id: "app", isSelectable: true, name: "page.tsx" }],
      },
      { id: "env-local", isSelectable: true, name: ".env.local (Plaintext)" },
      { id: "env-production", isSelectable: true, name: ".env.production.fhe 🔒" },
    ],
  },
];

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.set(".hiw-step", { opacity: 0, y: 50 });
      gsap.set(".hiw-demo", { opacity: 0, scale: 0.95 });
      gsap.to(".hiw-step",
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".hiw-steps-container", start: "top 80%" },
        }
      );
      gsap.to(".hiw-demo",
        {
          opacity: 1,
          scale: 1,
          duration: 1,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".hiw-demos-container", start: "top 80%" },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const steps = [
    { num: "01", title: "Connect Wallet", desc: "Sign in with your Ethereum wallet. No email or passwords required." },
    { num: "02", title: "Create Project", desc: "Initialize a secure vault for your team on our FHE registry." },
    { num: "03", title: "Push Secrets", desc: "Your .env is encrypted locally before touching any server." },
  ];

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-28 text-slate-100 relative overflow-hidden"
    >
      {/* Glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-aqua/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-peach/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <p className="font-mono text-xs font-semibold tracking-widest text-aqua uppercase mb-4">
            The flow
          </p>
          <h2 className="text-4xl font-bold mb-4 text-slate-100">
            How it <span className="text-aqua">works</span>
          </h2>
          <p className="text-slate-300 drop-shadow-sm font-medium text-lg">
            A seamless developer experience with uncompromising security.
          </p>
        </div>

        {/* Steps */}
        <div className="hiw-steps-container grid md:grid-cols-3 gap-12 relative mb-24">
          <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-px bg-white/8 -z-10" />
          {steps.map((step, idx) => (
            <div key={idx} className="hiw-step relative flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-white/[0.04] backdrop-blur-md border border-aqua/30 flex items-center justify-center font-mono text-xl font-bold mb-6 text-aqua shadow-[0_0_20px_rgba(45,212,191,0.15)] hover:scale-110 transition-transform cursor-default">
                {step.num}
              </div>
              <h3 className="text-lg font-bold mb-2 text-slate-100">{step.title}</h3>
              <p className="text-slate-300 drop-shadow-sm font-medium text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Demo panels */}
        <div className="hiw-demos-container grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* CLI Demo */}
          <div className="hiw-demo w-full rounded-xl border border-white/[0.06] bg-[#0d1117] overflow-hidden hover:border-aqua/25 transition-colors duration-500">
            <div className="flex items-center px-4 py-3 border-b border-white/[0.06] bg-[#161b22]">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-400/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-400/70" />
                <div className="w-3 h-3 rounded-full bg-green-400/70" />
              </div>
              <div className="mx-auto flex items-center gap-2 text-xs text-slate-500 font-mono">
                <Terminal className="size-3" />
                fheenv-cli
              </div>
            </div>
            <div className="p-6 font-mono text-[12px] leading-[1.85] text-slate-300 space-y-0.5">
              {/* create */}
              <div>
                <span className="font-bold" style={{ color: "#2DD4BF" }}>~/project ➜</span>{" "}
                <span className="text-slate-200">fheenv create</span>
              </div>
              <div className="text-slate-400 pl-1">Initializing zero-trust vault…</div>
              <div className="text-green-400 font-medium pl-1 pb-3">✔ Vault created · On-chain registry linked.</div>

              {/* push */}
              <div>
                <span className="font-bold" style={{ color: "#2DD4BF" }}>~/project ➜</span>{" "}
                <span className="text-slate-200">fheenv push .env.production</span>
              </div>
              <div className="text-slate-400 pl-1">Encrypting 14 variables with FHE…</div>
              <div className="text-slate-400 pl-1">Syncing with smart contract…</div>
              <div className="text-green-400 font-medium pl-1 pb-3">✔ Secrets pushed to on-chain registry.</div>

              {/* pull */}
              <div>
                <span className="font-bold" style={{ color: "#2DD4BF" }}>~/project ➜</span>{" "}
                <span className="text-slate-200">fheenv pull</span>
              </div>
              <div className="text-slate-400 pl-1">Fetching encrypted vars from registry…</div>
              <div className="text-slate-400 pl-1">Decrypting via FHE locally…</div>
              <div className="text-green-400 font-medium pl-1 pb-3">✔ Variables injected into environment.</div>

              {/* trailing prompt */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="font-bold" style={{ color: "#2DD4BF" }}>~/project ➜</span>
                <span className="inline-block w-[7px] h-[14px] rounded-sm animate-pulse" style={{ background: "#2DD4BF", opacity: 0.6 }} />
              </div>
            </div>
          </div>

          {/* File Tree Demo */}
          <div className="hiw-demo opacity-0 w-full rounded-xl border border-white/[0.06] bg-[#0d1117] overflow-hidden hover:border-peach/25 transition-colors duration-500">
            <div className="flex items-center px-4 py-3 border-b border-white/[0.06] bg-[#161b22]">
              <div className="mx-auto flex items-center gap-2 text-xs text-slate-500 font-mono">
                <FolderLock className="size-3" />
                project structure
              </div>
            </div>
            <div className="p-8 h-[360px]">
              <Tree
                className="bg-transparent rounded-md text-slate-300 p-2 overflow-hidden h-full border border-white/5"
                initialExpandedItems={["project", "src"]}
                initialSelectedId="env-production"
                elements={ELEMENTS}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
