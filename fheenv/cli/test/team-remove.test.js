const assert = require("node:assert/strict");
const { removeMemberAndRotate } = require("../src/commands/team-remove");

const member = "0x1111111111111111111111111111111111111111";

describe("team removal", function () {
  const options = {
    member,
    envName: "production",
    envFile: ".env",
  };

  it("rotates after a successful revocation by default", async function () {
    const calls = [];

    await removeMemberAndRotate(options, {
      revoke: async () => calls.push("revoke"),
      rotate: async () => calls.push("rotate"),
    });

    assert.deepEqual(calls, ["revoke", "rotate"]);
  });

  it("does not claim completion when rotation fails", async function () {
    await assert.rejects(
      removeMemberAndRotate(options, {
        revoke: async () => undefined,
        rotate: async () => {
          throw new Error("rotation failed");
        },
      }),
      /Member revoked but rotation failed/,
    );
  });

  it("requires an explicit noRotate flag to skip rotation", async function () {
    let rotated = false;

    const result = await removeMemberAndRotate(
      { ...options, noRotate: true },
      {
        revoke: async () => undefined,
        rotate: async () => {
          rotated = true;
        },
      },
    );

    assert.equal(rotated, false);
    assert.equal(result.rotationSkipped, true);
  });

  it("does not rotate when revocation fails", async function () {
    let rotated = false;

    await assert.rejects(
      removeMemberAndRotate(options, {
        revoke: async () => {
          throw new Error("revoke failed");
        },
        rotate: async () => {
          rotated = true;
        },
      }),
      /revoke failed/,
    );

    assert.equal(rotated, false);
  });
});
