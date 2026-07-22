import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

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

  webpack: (config, { isServer, webpack }) => {
    // These packages use runtime-only dynamic imports. Webpack cannot statically
    // analyze them, but they do not affect the browser bundle or cache output.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /fumadocs-mdx/, message: /build dependencies failed/ },
      {
        module: /ox/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];
    // fumadocs loads generated modules through dynamic URLs, which webpack's
    // persistent cache cannot trace. A production build is short-lived, so a
    // cache does not help there and disabling it removes the false warning.
    config.cache = false;

    // --- WASM support ---
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      // MetaMask's React Native storage adapter is optional in web builds.
      "@react-native-async-storage/async-storage": false,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-async-storage\/async-storage$/,
      }),
    );

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

const withMDX = createMDX();

export default withMDX(nextConfig);
