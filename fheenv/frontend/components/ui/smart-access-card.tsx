import React from "react";
import { User, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartAccessCardProps {
  className?: string;
}

export function SmartAccessCard({ className }: SmartAccessCardProps) {
  const permissions = [
    { name: "Decrypt & Pull", active: true },
    { name: "Push & Encrypt", active: true },
    { name: "Manage Team", active: false },
  ];

  return (
    <div
      className={cn(
        "relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0d1117] p-6 shadow-2xl overflow-hidden",
        className,
      )}
    >
      {/* Background glow */}
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-aqua/10 blur-[50px] pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-peach/10 blur-[50px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Avatar */}
        <div className="relative mb-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] shadow-[0_0_15px_rgba(45,212,191,0.15)]">
            <User className="h-10 w-10 text-aqua drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
          </div>
          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-aqua border-4 border-[#0d1117]">
            <BadgeCheck className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* User Info */}
        <h3 className="text-xl font-bold text-slate-100 mb-1 tracking-tight">0x12aF...9c4B</h3>
        <p className="text-sm font-medium text-aqua mb-6 bg-aqua/10 px-3 py-1 rounded-full border border-aqua/20">
          Project Owner
        </p>

        {/* Permissions */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            <span>Permission</span>
            <span>Status</span>
          </div>
          {permissions.map((perm, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3"
            >
              <span className="text-sm font-medium text-slate-300">{perm.name}</span>
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  perm.active ? "bg-aqua shadow-[0_0_8px_rgba(45,212,191,0.8)]" : "bg-slate-600",
                )}
              />
            </div>
          ))}
        </div>
        {/* FHE signature aesthetic */}
        <div className="mt-8 w-full border-t border-white/[0.06] pt-4 flex flex-col items-center">
          <div className="w-16 h-1 rounded-full bg-aqua/30 mb-2"></div>
          <div className="w-10 h-1 rounded-full bg-peach/30"></div>
        </div>
      </div>
    </div>
  );
}
