import React from 'react';
import { User, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SmartAccessCardProps {
  className?: string;
}

export function SmartAccessCard({ className }: SmartAccessCardProps) {
  const permissions = [
    { name: "View secrets", active: true },
    { name: "Push secrets", active: true },
    { name: "Manage team", active: false },
  ];

  return (
    <div className={cn("relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl overflow-hidden", className)}>
      {/* Background glow */}
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-aqua/20 blur-[50px] pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-peach/20 blur-[50px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Avatar */}
        <div className="relative mb-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-50 shadow-[0_0_15px_rgba(45,212,191,0.15)]">
            <User className="h-10 w-10 text-aqua drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
          </div>
          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-aqua border-4 border-white">
            <BadgeCheck className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* User Info */}
        <h3 className="text-xl font-bold text-slate-900 mb-1 tracking-tight">0x12aF...9c4B</h3>
        <p className="text-sm font-medium text-aqua mb-6 bg-aqua/10 px-3 py-1 rounded-full border border-aqua/20">Admin Access</p>

        {/* Permissions */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <span>Permission</span>
            <span>Status</span>
          </div>
          {permissions.map((perm, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{perm.name}</span>
              <div className={cn(
                "h-2 w-2 rounded-full",
                perm.active ? "bg-aqua shadow-[0_0_8px_rgba(45,212,191,0.8)]" : "bg-slate-300"
              )} />
            </div>
          ))}
        </div>
        {/* Fingerprint / FHE signature aesthetic */}
        <div className="mt-8 w-full border-t border-slate-100 pt-4 flex flex-col items-center">
           <div className="w-16 h-1 rounded-full bg-aqua/30 mb-2"></div>
           <div className="w-10 h-1 rounded-full bg-peach/40"></div>
        </div>
      </div>
    </div>
  );
}
