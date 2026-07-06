"use client";
import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto w-full z-50 relative">
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
        className="bg-aqua hover:bg-aqua/90 text-[#030712] px-5 py-2 rounded-full text-sm font-bold transition-all shadow-[0_0_16px_rgba(45,212,191,0.3)]"
      >
        Launch App
      </Link>
    </nav>
  );
}
