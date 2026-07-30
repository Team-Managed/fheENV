const assert = require("node:assert/strict");

const removed = "0x1111111111111111111111111111111111111111";
const retained = "0x2222222222222222222222222222222222222222";

function input(overrides = {}) {
  return {
    envName: "production",
    envContent: "API_KEY=test",
    excludeMembers: [removed],
    ...overrides,
  };
}

function workingDependencies(overrides = {}) {
  return {
    getEnvironment: async () => ({
      blobCid: "bafy-old",
      version: 1n,
    }),
    getActiveMembers: async () => [removed, retained],
    generateAesKey: () => Buffer.alloc(32, 1),
    encryptBlob: () => "encrypted-blob",
    splitKey: () => [10n, 20n],
    uploadBlob: async () => "bafy-new",
    encryptKeyHalf: async (value) => ({ value }),
    updateEnvironment: async () => undefined,
    batchGrantAccess: async () => undefined,
    ...overrides,
  };
}

describe("rotation service", function () {
  it("excludes a removed member before regranting", async function () {
    const granted = [];
    const { rotateEnvironment } = require("../src/lib/rotation");

    const result = await rotateEnvironment(
      input(),
      workingDependencies({
        batchGrantAccess: async (members) => granted.push(...members),
      }),
    );

    assert.deepEqual(granted, [retained]);
    assert.equal(result.newVersion, 2n);
    assert.equal(result.newCid, "bafy-new");
  });

  it("reports a partial rotation when regranting fails", async function () {
    const { rotateEnvironment, PartialRotationError } = require("../src/lib/rotation");

    await assert.rejects(
      rotateEnvironment(
        input(),
        workingDependencies({
          batchGrantAccess: async () => {
            throw new Error("regrant failed");
          },
        }),
      ),
      (error) =>
        error instanceof PartialRotationError &&
        error.newVersion === 2n &&
        error.newCid === "bafy-new" &&
        error.recoveryCommand === "fheenv rotate --env production --regrant-only",
    );
  });

  it("does not report an upload failure as a partial rotation", async function () {
    const { rotateEnvironment, PartialRotationError } = require("../src/lib/rotation");

    await assert.rejects(
      rotateEnvironment(
        input(),
        workingDependencies({
          uploadBlob: async () => {
            throw new Error("upload failed");
          },
        }),
      ),
      (error) => !(error instanceof PartialRotationError) && error.message === "upload failed",
    );
  });

  it("does not report an update failure as a partial rotation", async function () {
    const { rotateEnvironment, PartialRotationError } = require("../src/lib/rotation");

    await assert.rejects(
      rotateEnvironment(
        input(),
        workingDependencies({
          updateEnvironment: async () => {
            throw new Error("update failed");
          },
        }),
      ),
      (error) => !(error instanceof PartialRotationError) && error.message === "update failed",
    );
  });

  it("regrants current members without creating another version", async function () {
    const granted = [];
    const { regrantCurrentMembers } = require("../src/lib/rotation");

    const result = await regrantCurrentMembers({
      getActiveMembers: async () => [retained],
      batchGrantAccess: async (members) => granted.push(...members),
    });

    assert.deepEqual(granted, [retained]);
    assert.deepEqual(result, [retained]);
  });

  it("splits member grants at the contract batch limit", async function () {
    const { grantMembersInBatches } = require("../src/lib/rotation");
    const members = Array.from(
      { length: 201 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
    );
    const batches = [];

    await grantMembersInBatches(members, async (batch) => batches.push(batch));

    assert.deepEqual(
      batches.map((batch) => batch.length),
      [100, 100, 1],
    );
    assert.deepEqual(batches.flat(), members);
  });
});
