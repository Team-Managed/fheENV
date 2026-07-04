"use client";
import { Shield, EyeOff, Zap } from "lucide-react";
import { SmartAccessCard } from "@/components/ui/smart-access-card";
import { motion } from "motion/react";

const features = [
  {
    icon: <EyeOff className="size-5 text-aqua" />,
    title: "Zero-Trust Architecture",
    description: "Your environment variables are encrypted client-side. We never see your plaintext data or your keys.",
  },
  {
    icon: <Shield className="size-5 text-aqua" />,
    title: "Fully Homomorphic Encryption",
    description: "Compute directly on encrypted data. No need to decrypt your secrets to verify them or run secure operations.",
  },
  {
    icon: <Zap className="size-5 text-peach" />,
    title: "Web3 Native",
    description: "Built for decentralized teams. Use your wallet to manage access controls and share secrets securely.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-28 overflow-hidden relative">
      {/* Glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-aqua/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-peach/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-20">
          <div className="flex-1 max-w-2xl">
            <div className="mb-12">
              <p className="font-mono text-xs font-semibold tracking-widest text-aqua uppercase mb-4 flex items-center gap-2">
                <Shield className="size-3.5" />
                Built different
              </p>
              <h2 className="text-4xl font-bold text-slate-100 mb-4 leading-tight">
                Enterprise-grade security{" "}
                <span className="text-aqua">for your secrets</span>
              </h2>
              <p className="text-lg text-slate-400">
                Stop pasting .env files in Slack. Secure your secrets with the next generation of cryptographic privacy.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1.02, x: 4 }}
                  className="flex gap-4 p-5 rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/8 hover:border-aqua/30 hover:bg-aqua/[0.04] transition-all cursor-default shadow-lg"
                >
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 mb-1">{feature.title}</h3>
                    <p className="text-sm text-slate-300 leading-relaxed drop-shadow-sm font-medium">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex-1 relative flex items-center justify-center w-full min-h-[500px]">
            <SmartAccessCard />
          </div>
        </div>
      </div>
    </section>
  );
}
