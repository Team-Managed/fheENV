import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  ssr: true,
  // injected() detects MetaMask, Rainbow, Coinbase Wallet, etc. via
  // window.ethereum — no MetaMask SDK or analytics requests.
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC || undefined),
  },
});
