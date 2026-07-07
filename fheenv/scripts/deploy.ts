import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // For production: replace deployer.address with a multisig Safe address.
  // The owner controls upgrade rights via _authorizeUpgrade.
  const initialOwner = deployer.address;

  const Factory = await ethers.getContractFactory("fheENVRegistry");

  console.log("\nDeploying UUPS proxy...");
  const proxy = await upgrades.deployProxy(Factory, [initialOwner], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\nProxy address (use this everywhere):", proxyAddress);
  console.log("Implementation address:", implAddress);
  console.log("Upgrade owner:", initialOwner);
  console.log("\n--- Add to your .env ---");
  console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${proxyAddress}`);
  console.log("\n⚠  In production, transfer ownership to a multisig before any upgrade:");
  console.log(`    registry.transferOwnership(<SAFE_MULTISIG_ADDRESS>)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
