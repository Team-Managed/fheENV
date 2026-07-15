"use client";
import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <nav className="relative z-50 mx-auto flex h-20 w-full max-w-7xl items-center justify-between border-b border-brand-blue/15 bg-brand-ink px-6">
      <Link href="/" className="flex items-center gap-2">
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
        className="bg-brand-blue px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
      >
        Launch App
      </Link>
    </nav>
  );
}
