"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqs = [
    {
      q: "What is Fully Homomorphic Encryption?",
      a: "FHE works with encrypted data without exposing its contents. fheENV uses it to protect each environment's AES key on-chain.",
    },
    {
      q: "Who holds the decryption keys?",
      a: "Only wallets you approve can decrypt the AES key through the Threshold Network. Decryption happens on the user's device.",
    },
    {
      q: "Is there a CLI tool?",
      a: "Yes. Use it to push, pull, run, rotate, and manage wallet access.",
    },
    {
      q: "Is there a web dashboard?",
      a: "Yes. Connect a wallet to create projects and inspect public on-chain activity. Secret operations remain in the CLI.",
    },
    {
      q: "What happens when someone leaves the team?",
      a: "Remove their access, then rotate the environment. Rotation creates a new AES key that excludes the revoked wallet.",
    },
    {
      q: "Can I self-host it?",
      a: "Yes. The Elastic License 2.0 allows self-hosting, modification, and contributions. It does not allow a competing managed service.",
    },
  ];

  return (
    <section id="faq" className="relative pt-10 sm:pt-16">
      {/* Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.04)_0%,transparent_60%)] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="font-mono text-xs font-semibold tracking-widest text-brand-blue uppercase mb-4">
            Got questions?
          </p>
          <h2 className="text-4xl font-bold text-slate-100">
            Frequently Asked <span className="text-peach">Questions</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.005 }}
              className="rounded-xl border border-white/8 bg-white/[0.03] hover:border-brand-blue/25 transition-all cursor-pointer overflow-hidden"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
            >
              <div className="flex justify-between items-center p-5 text-slate-100 font-semibold">
                <span>{faq.q}</span>
                <motion.span
                  animate={{ rotate: openIdx === i ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-brand-blue text-xl ml-4 shrink-0"
                >
                  +
                </motion.span>
              </div>
              <AnimatePresence>
                {openIdx === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-slate-400 leading-relaxed text-sm border-t border-white/5 pt-4">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 border-t border-white/8 py-8 sm:mt-16">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-mono text-lg font-bold text-slate-100">
            <span className="text-brand-blue">fhe</span>ENV
          </span>
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} fheENV. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm text-slate-500">
            <a href="/docs" className="hover:text-brand-blue transition-colors">
              Docs
            </a>
            <a
              href="https://github.com/Team-Managed/fheENV"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-blue transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
