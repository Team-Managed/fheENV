import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected(), metaMask()],
  transports: {
    // Pass the RPC URL if set, otherwise pass undefined so wagmi uses the
    // chain's built-in public RPC (https://rpc.sepolia.org).
    // Never pass "" — viem sends requests to an empty URL and throws.
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC || undefined),
  },
});
