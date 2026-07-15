"use client";
import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <nav
      data-site-navbar
      className="fixed inset-x-0 top-3 z-[100] mx-auto flex h-14 w-[calc(100%-1rem)] max-w-7xl items-center justify-between rounded-xl border border-white/[0.08] bg-[#0a0a0a]/70 px-3 shadow-2xl backdrop-blur-xl transition-all duration-300 sm:top-4 sm:h-16 sm:w-[calc(100%-2rem)] sm:rounded-2xl sm:px-6"
    >
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <Image
          src="/brand/logo-icon.svg"
          alt="fheENV Logo"
          width={24}
          height={24}
          className="size-6"
        />
        <span className="font-mono text-xl font-bold tracking-tight text-slate-100">
          <span className="text-brand-blue">fhe</span>ENV
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <Link href="#features" className="hover:text-brand-blue transition-colors">
          Features
        </Link>
        <Link href="#how-it-works" className="hover:text-brand-blue transition-colors">
          How it works
        </Link>
        <Link href="/docs" className="hover:text-brand-blue transition-colors">
          Docs
        </Link>
        <Link href="#faq" className="hover:text-brand-blue transition-colors">
          FAQ
        </Link>
      </div>

      <Link
        href="/dashboard"
        className="rounded-lg bg-brand-blue px-3 py-2 text-xs font-bold text-brand-ink transition-colors hover:bg-brand-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-sm"
      >
        Launch App
      </Link>
    </nav>
  );
}
