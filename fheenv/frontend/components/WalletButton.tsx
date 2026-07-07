"use client";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Wallet, AlertTriangle } from "lucide-react";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted)
    return (
      <div className="w-32 h-8 rounded-full opacity-0" style={{ background: "var(--surface)" }} />
    );

  const isWrongNetwork = isConnected && chainId !== sepolia.id;

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all"
        style={{
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.35)",
          color: "#f87171",
        }}
      >
        <AlertTriangle className="size-3.5" />
        Switch to Sepolia
      </button>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
        >
          <span
            className="size-1.5 rounded-full bg-green-400"
            style={{ boxShadow: "0 0 6px #4ade80" }}
          />
          <span className="font-mono text-slate-300">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
          <span className="text-slate-600">·</span>
          <span style={{ color: "var(--aqua)" }} className="font-medium">
            Sepolia
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="text-xs px-3 py-1.5 rounded-full transition-all"
          style={{ color: "var(--text-muted)", border: "1px solid var(--surface-border)" }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all"
      style={{
        background: "var(--aqua)",
        color: "#030712",
        boxShadow: "0 0 14px var(--aqua-glow)",
      }}
    >
      <Wallet className="size-4" />
      Connect Wallet
    </button>
  );
}
