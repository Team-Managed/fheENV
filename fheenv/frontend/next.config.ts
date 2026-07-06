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

  // Empty turbopack config silences the "no turbopack config" error
  // while we use --webpack for production builds
  turbopack: {},

  webpack: (config, { isServer }) => {
    // --- WASM support ---
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    if (!isServer) {
      // Prevent webpack from bundling tfhe/node-tfhe WASM into the client JS
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "node-tfhe",
      ];
    }

    // Handle .wasm files as assets
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    return config;
  },
};

export default nextConfig;
