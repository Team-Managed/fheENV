import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const Factory = await ethers.getContractFactory("fheENVRegistry");
  const registry = await Factory.deploy();
  const deploymentTx = registry.deploymentTransaction();
  const receipt = deploymentTx ? await deploymentTx.wait() : null;
  const address = await registry.getAddress();

  console.log("\nfheENVRegistry deployed to:", address);
  console.log("\n--- Add to your .env ---");
  console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${address}`);
  if (receipt?.blockNumber) {
    console.log(`REGISTRY_START_BLOCK=${receipt.blockNumber}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
