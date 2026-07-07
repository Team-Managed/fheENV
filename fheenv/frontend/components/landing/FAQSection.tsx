"use client";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqs = [
    {
      q: "What is Fully Homomorphic Encryption?",
      a: "FHE allows computations on encrypted data without decrypting it first. Your AES key is stored on-chain as FHE ciphertexts — even blockchain node operators and our servers cannot read your secrets. Only addresses you explicitly grant access to can decrypt via the Threshold Network.",
    },
    {
      q: "Who holds the decryption keys?",
      a: "Only you and the team members you grant access to via your wallet. The AES key is split into two halves, each FHE-encrypted as euint128 on-chain. Decryption happens locally through the Threshold Network — no one else ever sees plaintext.",
    },
    {
      q: "Is there a CLI tool?",
      a: "Yes! Install with one command: curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash. Then use fheenv push, fheenv pull, fheenv run (inject secrets into processes without writing to disk), and fheenv rotate (re-key after revoking access).",
    },
    {
      q: "Is there a web dashboard?",
      a: "Yes — connect your wallet at fheenv.vercel.app to create projects, push/pull secrets, view and edit variables, manage team access, and see a full on-chain audit log. All encryption happens in your browser.",
    },
    {
      q: "What happens when someone leaves the team?",
      a: "Revoke their access with fheenv team remove, then run fheenv rotate to re-encrypt with a fresh AES key. The old ciphertexts become useless to the removed member since they never receive FHE.allow on the new handles.",
    },
    {
      q: "Is this open source?",
      a: "Yes — licensed under Elastic License 2.0. You can self-host, fork, contribute, and use it freely for your own projects. The only restriction is you cannot resell it as a competing managed service.",
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
            Frequently Asked <span className="text-peach">Questions</span>
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
            <Link href="/docs" className="hover:text-aqua transition-colors">
              Docs
            </Link>
            <a
              href="https://github.com/Team-Managed/fheENV"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-aqua transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
