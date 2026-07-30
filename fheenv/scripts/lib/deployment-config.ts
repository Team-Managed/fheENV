import { getAddress, isAddress } from "ethers";

export interface DeploymentConfig {
  upgradeAdmin: string;
  proposerSafe?: string;
  minimumDelaySeconds: bigint;
  local: boolean;
}

function requiredAddress(name: string, value?: string): string {
  if (!value || !isAddress(value)) {
    throw new Error(`${name} must be a valid address`);
  }
  return getAddress(value);
}

export function resolveDeploymentConfig(
  networkName: string,
  env: NodeJS.ProcessEnv,
  deployer: string,
): DeploymentConfig {
  const local = networkName === "hardhat" || networkName === "localhost";
  if (local) {
    return {
      upgradeAdmin: getAddress(deployer),
      minimumDelaySeconds: 0n,
      local: true,
    };
  }

  const minimumDelaySeconds = BigInt(env.MIN_UPGRADE_DELAY_SECONDS ?? "86400");
  if (minimumDelaySeconds < 86400n) {
    throw new Error("MIN_UPGRADE_DELAY_SECONDS must be at least 86400");
  }

  return {
    upgradeAdmin: requiredAddress("UPGRADE_TIMELOCK_ADDRESS", env.UPGRADE_TIMELOCK_ADDRESS),
    proposerSafe: requiredAddress("UPGRADE_SAFE_ADDRESS", env.UPGRADE_SAFE_ADDRESS),
    minimumDelaySeconds,
    local: false,
  };
}
