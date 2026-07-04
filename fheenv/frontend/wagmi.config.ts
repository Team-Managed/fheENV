import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  // injected() detects MetaMask, Rainbow, Coinbase Wallet, etc. via
  // window.ethereum — no MetaMask SDK or analytics requests.
  connectors: [injected()],
  transports: {
    // Pass the RPC URL if set, otherwise pass undefined so wagmi uses the
    // chain's built-in public RPC (https://rpc.sepolia.org).
    // Never pass "" — viem sends requests to an empty URL and throws.
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC || undefined),
  },
});
