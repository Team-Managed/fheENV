import { ethers, network, upgrades } from "hardhat";

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address`);
  }
  return ethers.getAddress(value);
}

async function main() {
  const proxy = requiredAddress("REGISTRY_PROXY_ADDRESS");
  const expectedImplementation = requiredAddress("EXPECTED_IMPLEMENTATION_ADDRESS");
  const code = await ethers.provider.getCode(proxy);
  if (code === "0x") throw new Error("REGISTRY_PROXY_ADDRESS has no deployed bytecode");

  const actualImplementation = await upgrades.erc1967.getImplementationAddress(proxy);
  if (actualImplementation !== expectedImplementation) {
    throw new Error(
      `Implementation mismatch: expected ${expectedImplementation}, got ${actualImplementation}`,
    );
  }

  const registry = await ethers.getContractAt("fheENVRegistry", proxy);
  const [owner, nextProjectId, adminSlot] = await Promise.all([
    registry.owner() as Promise<string>,
    registry.nextProjectId() as Promise<bigint>,
    upgrades.erc1967.getAdminAddress(proxy),
  ]);

  console.log("Network:", network.name);
  console.log("Proxy:", proxy);
  console.log("Implementation:", actualImplementation);
  console.log("Upgrade owner:", owner);
  console.log("ERC-1967 admin slot:", adminSlot, "(not the UUPS upgrade owner)");
  console.log("nextProjectId:", nextProjectId.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
