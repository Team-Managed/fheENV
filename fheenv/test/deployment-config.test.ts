import { expect } from "chai";
import { resolveDeploymentConfig } from "../scripts/lib/deployment-config";

const deployer = "0x1000000000000000000000000000000000000000";
const timelock = "0x2000000000000000000000000000000000000000";
const safe = "0x3000000000000000000000000000000000000000";

describe("deployment configuration", function () {
  it("uses the deployer only on ephemeral local networks", function () {
    expect(resolveDeploymentConfig("hardhat", {}, deployer)).to.deep.equal({
      upgradeAdmin: deployer,
      minimumDelaySeconds: 0n,
      local: true,
    });
  });

  it("rejects a non-local deployment without a timelock and Safe", function () {
    expect(() => resolveDeploymentConfig("sepolia", {}, deployer)).to.throw(
      "UPGRADE_TIMELOCK_ADDRESS",
    );
  });

  it("returns explicit governance for a non-local deployment", function () {
    expect(
      resolveDeploymentConfig(
        "sepolia",
        {
          UPGRADE_TIMELOCK_ADDRESS: timelock,
          UPGRADE_SAFE_ADDRESS: safe,
          MIN_UPGRADE_DELAY_SECONDS: "86400",
        },
        deployer,
      ),
    ).to.deep.equal({
      upgradeAdmin: timelock,
      proposerSafe: safe,
      minimumDelaySeconds: 86400n,
      local: false,
    });
  });

  it("rejects a non-local delay shorter than one day", function () {
    expect(() =>
      resolveDeploymentConfig(
        "sepolia",
        {
          UPGRADE_TIMELOCK_ADDRESS: timelock,
          UPGRADE_SAFE_ADDRESS: safe,
          MIN_UPGRADE_DELAY_SECONDS: "3600",
        },
        deployer,
      ),
    ).to.throw("at least 86400");
  });
});
