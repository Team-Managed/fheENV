import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tfhe", "node-tfhe", "@cofhe/sdk"],
  transpilePackages: [
    "wagmi",
    "viem",
    "@rainbow-me/rainbowkit",
    "@wagmi/core",
    "@wagmi/connectors",
  ],
};

export default nextConfig;
