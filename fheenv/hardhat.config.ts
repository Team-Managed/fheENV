import { defineConfig } from "hardhat/config";
import cofhePlugin from "@cofhe/hardhat-3-plugin";
import "dotenv/config";

export default defineConfig({
  plugins: [cofhePlugin],
  solidity: {
    version: "0.8.25",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { type: "edr-simulated" as const },
    ...(process.env.SEPOLIA_RPC_URL
      ? {
          sepolia: {
            type: "http" as const,
            url: process.env.SEPOLIA_RPC_URL,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
          },
        }
      : {}),
  },
  cofhe: {
    logMocks: false,
    gasWarning: false,
  },
});
