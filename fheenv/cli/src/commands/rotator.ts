import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createClients } from "../lib/wallet";
import { addRotator, removeRotator, isRotator } from "@fheenv/core";
import { type Address } from "viem";

export interface RotatorAddOptions {
  address: string;
  projectId?: string;
}

export interface RotatorRemoveOptions {
  address: string;
  projectId?: string;
}

function validateAddress(addr: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error(`Invalid Ethereum address: ${addr}`);
  }
  return addr as Address;
}

/**
 * Grant the Rotator role to an address.
 *
 * A Rotator can call updateEnvironment() and batchGrantAccess() but cannot
 * call revokeAccess(), grantAccess(), addOwner(), or transferOwnership().
 * Intended for automated rotation services and CI pipelines.
 *
 * SECURITY NOTE (§4.5): A Rotator that calls updateEnvironment() receives
 * FHE decrypt permission on the resulting handles. This makes it a
 * high-value credential — secure accordingly (KMS or HSM-backed key, not
 * a plaintext secret in an env var for production use).
 */
export async function rotatorAddCommand(opts: RotatorAddOptions): Promise<void> {
  const config = readConfig();
  const rotatorAddress = validateAddress(opts.address);
  const projectId = BigInt(opts.projectId ?? config.projectId);

  const spinner = ora(`Granting Rotator role to ${rotatorAddress}...`).start();
  try {
    const { publicClient, walletClient } = createClients(config.rpcUrl, config.chainId);

    // Check if already a rotator
    const already = await isRotator(
      config.registryAddress as Address,
      projectId,
      rotatorAddress,
      publicClient,
    );
    if (already) {
      spinner.warn(chalk.yellow(`${rotatorAddress} already has the Rotator role.`));
      return;
    }

    await addRotator(
      config.registryAddress as Address,
      projectId,
      rotatorAddress,
      walletClient,
      publicClient,
    );

    spinner.succeed(chalk.green(`Rotator role granted to ${rotatorAddress}`));
    console.log(chalk.dim(`  Project: ${projectId}`));
    console.log(
      chalk.yellow(
        "\n  ⚠  SECURITY: The Rotator address now has FHE decrypt access on all environments\n" +
          "  it rotates. Store this credential in a KMS or HSM — not a plaintext secret.",
      ),
    );
  } catch (err) {
    spinner.fail("Failed to grant Rotator role");
    throw err;
  }
}

/**
 * Revoke the Rotator role from an address.
 *
 * After removal, the address can no longer call updateEnvironment() or
 * batchGrantAccess() on this project. Note: FHE decrypt access on
 * already-granted handles persists until the next key rotation.
 */
export async function rotatorRemoveCommand(opts: RotatorRemoveOptions): Promise<void> {
  const config = readConfig();
  const rotatorAddress = validateAddress(opts.address);
  const projectId = BigInt(opts.projectId ?? config.projectId);

  const spinner = ora(`Revoking Rotator role from ${rotatorAddress}...`).start();
  try {
    const { publicClient, walletClient } = createClients(config.rpcUrl, config.chainId);

    const isRot = await isRotator(
      config.registryAddress as Address,
      projectId,
      rotatorAddress,
      publicClient,
    );
    if (!isRot) {
      spinner.warn(chalk.yellow(`${rotatorAddress} does not have the Rotator role.`));
      return;
    }

    await removeRotator(
      config.registryAddress as Address,
      projectId,
      rotatorAddress,
      walletClient,
      publicClient,
    );

    spinner.succeed(chalk.yellow(`Rotator role revoked from ${rotatorAddress}`));
    console.log(chalk.dim(`  Project: ${projectId}`));
    console.log(
      chalk.dim(
        "  Note: run `fheenv rotate` to issue new FHE handles that this address cannot decrypt.",
      ),
    );
  } catch (err) {
    spinner.fail("Failed to revoke Rotator role");
    throw err;
  }
}
