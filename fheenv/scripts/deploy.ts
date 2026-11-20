import fs from "fs";
import path from "path";
import { ethers, network, upgrades } from "hardhat";
import { resolveDeploymentConfig, type DeploymentConfig } from "./lib/deployment-config";

const TIMELOCK_ABI = [
  "function getMinDelay() view returns (uint256)",
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function CANCELLER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
];

async function verifyTimelock(config: DeploymentConfig): Promise<void> {
  if (config.local) return;

  const code = await ethers.provider.getCode(config.upgradeAdmin);
  if (code === "0x") {
    throw new Error("UPGRADE_TIMELOCK_ADDRESS has no deployed bytecode");
  }

  const timelock = new ethers.Contract(config.upgradeAdmin, TIMELOCK_ABI, ethers.provider);
  const [delay, proposerRole, cancellerRole] = await Promise.all([
    timelock.getMinDelay() as Promise<bigint>,
    timelock.PROPOSER_ROLE() as Promise<string>,
    timelock.CANCELLER_ROLE() as Promise<string>,
  ]);
  if (delay < config.minimumDelaySeconds) {
    throw new Error(`Timelock delay ${delay} is below required ${config.minimumDelaySeconds}`);
  }

  const proposerSafe = config.proposerSafe!;
  const [canPropose, canCancel] = await Promise.all([
    timelock.hasRole(proposerRole, proposerSafe) as Promise<boolean>,
    timelock.hasRole(cancellerRole, proposerSafe) as Promise<boolean>,
  ]);
  if (!canPropose || !canCancel) {
    throw new Error("UPGRADE_SAFE_ADDRESS must have timelock proposer and canceller roles");
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);
  const config = resolveDeploymentConfig(network.name, process.env, deployer.address);

  console.log("Network:", network.name, Number(chain.chainId));
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("Upgrade admin:", config.upgradeAdmin);

  await verifyTimelock(config);

  const Factory = await ethers.getContractFactory("fheENVRegistry");
  await upgrades.validateImplementation(Factory, { kind: "uups" });

  const proxy = await upgrades.deployProxy(Factory, [config.upgradeAdmin], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const upgradeOwner = await proxy.owner();
  if (upgradeOwner !== config.upgradeAdmin) {
    throw new Error(`Proxy owner mismatch: expected ${config.upgradeAdmin}, got ${upgradeOwner}`);
  }

  const deploymentTx = proxy.deploymentTransaction();
  const receipt = await deploymentTx?.wait();
  if (!receipt) throw new Error("Proxy deployment receipt is unavailable");

  console.log("Proxy address:", proxyAddress);
  console.log("Implementation address:", implementationAddress);
  console.log("Upgrade owner:", upgradeOwner);
  console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${proxyAddress}`);
  console.log(`NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK=${receipt.blockNumber}`);

  if (!config.local) {
    const manifest = {
      network: network.name,
      chainId: Number(chain.chainId),
      proxy: proxyAddress,
      implementation: implementationAddress,
      upgradeAdmin: config.upgradeAdmin,
      proposerSafe: config.proposerSafe,
      minimumDelaySeconds: config.minimumDelaySeconds.toString(),
      deployBlock: receipt.blockNumber,
      deploymentTx: receipt.hash,
      deployedAt: new Date().toISOString(),
    };
    const directory = path.resolve("deployments");
    const output = path.join(directory, `${network.name}.json`);
    const temporary = `${output}.tmp`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, output);
    console.log("Deployment manifest:", output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
