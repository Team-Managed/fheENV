"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, Lock, Terminal } from "lucide-react";

export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqs = [
    {
      q: "What is Fully Homomorphic Encryption?",
      a: "FHE is a form of encryption that permits users to perform computations on its encrypted data without first decrypting it. For environment variables, this means we can route and manage your secrets without ever knowing what they are.",
    },
    {
      q: "Who holds the decryption keys?",
      a: "Only you and the team members you explicitly grant access to via your wallet. We do not have access to your keys — not during push, pull, or compute.",
    },
    {
      q: "Is there a CLI tool?",
      a: "Yes, you can push and pull encrypted .env files directly into your local dev environment or CI/CD pipelines with fheenv create, fheenv push, and fheenv pull.",
    },
  ];

  return (
    <section id="faq" className="py-28 relative">
      {/* Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.04)_0%,transparent_60%)] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="font-mono text-xs font-semibold tracking-widest text-aqua uppercase mb-4">
            Got questions?
          </p>
          <h2 className="text-4xl font-bold text-slate-100">
            Frequently Asked{" "}
            <span className="text-peach">Questions</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.005 }}
              className="rounded-xl border border-white/8 bg-white/[0.03] hover:border-aqua/25 transition-all cursor-pointer overflow-hidden"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
            >
              <div className="flex justify-between items-center p-5 text-slate-100 font-semibold">
                <span>{faq.q}</span>
                <motion.span
                  animate={{ rotate: openIdx === i ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-aqua text-xl ml-4 shrink-0"
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
      <div className="mt-28 pt-8 border-t border-white/8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-mono text-lg font-bold text-slate-100">
            <span className="text-aqua">fhe</span>ENV
          </span>
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} fheENV. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm text-slate-500">
            <span className="hover:text-aqua transition-colors cursor-pointer">Docs</span>
            <span className="hover:text-aqua transition-colors cursor-pointer">GitHub</span>
            <span className="hover:text-aqua transition-colors cursor-pointer">Discord</span>
          </div>
        </div>
      </div>
    </section>
  );
}
