// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../fheENVRegistry.sol";

contract fheENVRegistryV2 is fheENVRegistry {
    uint256 public upgradeMarker;

    /// @custom:oz-upgrades-validate-as-initializer
    function initializeV2(uint256 marker) external reinitializer(2) {
        upgradeMarker = marker;
    }

    function implementationVersion() external pure returns (uint256) {
        return 2;
    }
}
