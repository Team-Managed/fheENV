"use client";
import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <nav className="fixed top-4 inset-x-0 z-[100] mx-auto flex h-16 w-[calc(100%-2rem)] max-w-7xl items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/70 backdrop-blur-xl px-6 shadow-2xl transition-all duration-300">
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <Image
          src="/brand/logo-icon.svg"
          alt="fheENV Logo"
          width={24}
          height={24}
          className="size-6"
        />
        <span className="font-mono text-xl font-bold tracking-tight text-slate-100">
          <span className="text-aqua">fhe</span>ENV
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <Link href="#features" className="hover:text-aqua transition-colors">
          Features
        </Link>
        <Link href="#how-it-works" className="hover:text-aqua transition-colors">
          How it works
        </Link>
        <Link href="#faq" className="hover:text-aqua transition-colors">
          FAQ
        </Link>
      </div>

      <Link
        href="/dashboard"
        className="bg-brand-blue px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue rounded-xl"
      >
        Launch App
      </Link>
    </nav>
  );
}
