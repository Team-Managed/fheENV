import { network } from "hardhat";
import { formatEther } from "viem";

async function main() {
  const conn = await network.create();
  const publicClient = await conn.viem.getPublicClient();
  const [deployer] = await conn.viem.getWalletClients();

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Deployer:", deployer.account.address);
  console.log("Balance:", formatEther(balance), "ETH");

  const registry = await conn.viem.deployContract("fheENVRegistry");

  console.log("\nfheENVRegistry deployed to:", registry.address);
  console.log("\n--- Add to your .env ---");
  console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${registry.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
