"use client";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

export function WalletButton() {
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();

    const isWrongNetwork = isConnected && chainId !== sepolia.id;

    if (isWrongNetwork) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-xs text-red-400 font-mono">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <button
                    onClick={() => switchChain({ chainId: sepolia.id })}
                    className="text-xs bg-red-800 hover:bg-red-700 text-white border border-red-600 px-3 py-1 rounded"
                >
                    ⚠ Switch to Sepolia
                </button>
            </div>
        );
    }

    if (isConnected) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-xs text-green-400 font-mono">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <span className="text-xs text-gray-600">Sepolia</span>
                <button
                    onClick={() => disconnect()}
                    className="text-xs text-gray-500 hover:text-white border border-gray-700 px-2 py-1 rounded"
                >
                    Disconnect
                </button>
            </div>
        );
    }
    return (
        <button
            onClick={() => connect({ connector: connectors[0] })}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
            Connect Wallet
        </button>
    );
}
