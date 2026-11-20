import fs from "fs";
import path from "path";
import type { TransactionResponse } from "ethers";
import { ethers, network, upgrades } from "hardhat";

function requiredAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address`);
  }
  return ethers.getAddress(value);
}

async function implementationAddress(prepared: string | TransactionResponse): Promise<string> {
  if (typeof prepared === "string") return ethers.getAddress(prepared);
  const receipt = await prepared.wait();
  if (!receipt?.contractAddress) {
    throw new Error("Prepared implementation deployment has no contract address");
  }
  return ethers.getAddress(receipt.contractAddress);
}

async function main() {
  const proxy = requiredAddress("REGISTRY_PROXY_ADDRESS");
  const code = await ethers.provider.getCode(proxy);
  if (code === "0x") throw new Error("REGISTRY_PROXY_ADDRESS has no deployed bytecode");

  const Factory = await ethers.getContractFactory("fheENVRegistry");
  const currentImplementation = await upgrades.erc1967.getImplementationAddress(proxy);
  await upgrades.validateUpgrade(proxy, Factory, { kind: "uups" });
  const prepared = await upgrades.prepareUpgrade(proxy, Factory, {
    kind: "uups",
    getTxResponse: true,
  });
  const newImplementation = await implementationAddress(prepared);
  if (newImplementation === currentImplementation) {
    throw new Error("Prepared implementation is unchanged");
  }

  const calldata = Factory.interface.encodeFunctionData("upgradeToAndCall", [
    newImplementation,
    "0x",
  ]);
  const chain = await ethers.provider.getNetwork();
  const proposal = {
    network: network.name,
    chainId: Number(chain.chainId),
    target: proxy,
    value: "0",
    calldata,
    currentImplementation,
    newImplementation,
    preparedAt: new Date().toISOString(),
  };

  const directory = path.resolve("deployments");
  const output = path.join(directory, `${network.name}-upgrade-proposal.json`);
  const temporary = `${output}.tmp`;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(proposal, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, output);

  console.log("Upgrade proposal:", output);
  console.log(JSON.stringify(proposal, null, 2));
  console.log("Submit this target/value/calldata through the configured Safe and timelock.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
