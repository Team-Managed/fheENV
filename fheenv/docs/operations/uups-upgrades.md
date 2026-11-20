# UUPS deployment and upgrade runbook

The proxy upgrade owner must be an OpenZeppelin-compatible timelock whose proposer and canceller
roles are held by the configured Safe. A deployer wallet must not own a non-local proxy.

## Initial deployment

1. Deploy and review the Safe.
2. Deploy a timelock with a delay of at least 86,400 seconds.
3. Grant the Safe the timelock proposer and canceller roles.
4. Set `UPGRADE_TIMELOCK_ADDRESS`, `UPGRADE_SAFE_ADDRESS`, and
   `MIN_UPGRADE_DELAY_SECONDS`.
5. Run `pnpm deploy:sepolia`.
6. Verify the proxy and implementation bytecode on the explorer.
7. Review and commit `deployments/<network>.json`.
8. Configure frontend, CLI, and indexers with the proxy address and deployment block from the
   manifest.

The immutable Sepolia registry is a separate deployment. Existing projects and FHE permissions do
not move into the proxy. Users must recreate projects and re-encrypt/push secrets against the new
proxy.

## Upgrade

1. Add the new implementation and a real V1-to-V2 storage-preservation test.
2. Run the complete contract and application validation matrix.
3. Set `REGISTRY_PROXY_ADDRESS` and run
   `pnpm prepare-upgrade -- --network <network>`.
4. Independently review OpenZeppelin's storage-layout validation, the new bytecode, implementation
   address, target proxy, and calldata in `deployments/<network>-upgrade-proposal.json`.
5. Submit the target, zero value, and calldata through the Safe to the timelock.
6. Wait the complete timelock delay.
7. Execute through the timelock.
8. Set `EXPECTED_IMPLEMENTATION_ADDRESS` and run
   `pnpm verify-upgrade -- --network <network>`.
9. Run create/read/grant/revoke/rotate smoke tests and monitor failures before resuming normal
   writes.
10. Commit the updated deployment manifest and proposal evidence with the release.

## Incident recovery

Pause new writes at the client/operations layer while investigating. Preserve the proxy and its
storage. Prepare a new reviewed implementation, validate its storage layout against the live proxy,
and use the same Safe/timelock process.

Do not restore raw proxy storage, change the implementation slot manually, or blindly downgrade to
old bytecode. A safe recovery implementation must remain compatible with every storage change
already executed.
