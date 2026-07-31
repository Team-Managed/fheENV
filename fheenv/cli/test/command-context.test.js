const assert = require("node:assert/strict");
const { withCommandContext } = require("../src/lib/command-context");

describe("command context lifecycle", function () {
  it("closes the signer on success and failure", async function () {
    for (const failure of [false, true]) {
      let closed = 0;
      await assert.doesNotReject(async () => {
        try {
          await withCommandContext(
            async () => ({ close: async () => void (closed += 1) }),
            async () => {
              if (failure) throw new Error("operation failed");
            },
          );
        } catch (error) {
          assert.equal(error.message, "operation failed");
        }
      });
      assert.equal(closed, 1);
    }
  });
});
