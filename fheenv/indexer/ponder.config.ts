import { createConfig, rateLimit } from "ponder";
import { http } from "viem";
import { REGISTRY_ABI } from "./abis/RegistryAbi.js";

const registryAddress = (process.env.REGISTRY_ADDRESS ||
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
  "0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2") as `0x${string}`;

const startBlock = process.env.REGISTRY_START_BLOCK
  ? parseInt(process.env.REGISTRY_START_BLOCK, 10)
  : 11383170;

export default createConfig({
  chains: {
    sepolia: {
      id: 11155111,
      ethGetLogsBlockRange: 1000,
      rpc: rateLimit(
        http(
          process.env.PONDER_RPC_URL_11155111 ||
            process.env.SEPOLIA_RPC_URL ||
            "https://ethereum-sepolia-rpc.publicnode.com",
        ),
        { requestsPerSecond: 5 },
      ),
    },
  },
  contracts: {
    fheENVRegistry: {
      chain: "sepolia",
      abi: REGISTRY_ABI,
      address: registryAddress,
      startBlock,
    },
  },
});
