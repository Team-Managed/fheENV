import Link from "next/link";
import Image from "next/image";
import { House, LayoutDashboard } from "lucide-react";
import { WalletButton } from "@/components/WalletButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Top nav — mirrors landing Navbar */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          borderColor: "var(--surface-border)",
          background: "rgba(3,7,18,0.85)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/logo-icon.svg"
              alt="fheENV Logo"
              width={20}
              height={20}
              className="size-5"
            />
            <span className="font-mono font-bold tracking-tight text-slate-100">
              <span style={{ color: "var(--brand-blue)" }}>fhe</span>ENV
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            >
              <House className="size-4" />
              <span className="hidden md:inline">Home</span>
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            >
              <LayoutDashboard className="size-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
