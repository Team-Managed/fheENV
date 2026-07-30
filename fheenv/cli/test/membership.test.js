const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { reduceAccessEvents } = require("../src/lib/contracts-node");
const { readConfig } = require("../src/lib/config");

describe("membership replay", function () {
  const member = "0x1111111111111111111111111111111111111111";

  it("reactivates a member granted after revocation", function () {
    const result = reduceAccessEvents([
      { kind: "grant", member, blockNumber: 1n, logIndex: 0 },
      { kind: "revoke", member, blockNumber: 2n, logIndex: 0 },
      { kind: "grant", member, blockNumber: 3n, logIndex: 0 },
    ]);

    assert.deepEqual(result, [member]);
  });

  it("uses log index to order events in one block", function () {
    const result = reduceAccessEvents([
      { kind: "revoke", member, blockNumber: 4n, logIndex: 2 },
      { kind: "grant", member, blockNumber: 4n, logIndex: 1 },
    ]);

    assert.deepEqual(result, []);
  });

  it("fails closed when the deployment block is missing", function () {
    const originalCwd = process.cwd();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-config-"));
    fs.writeFileSync(
      path.join(directory, ".fheenv.json"),
      JSON.stringify({
        projectId: 1,
        registryAddress: "0x2222222222222222222222222222222222222222",
        rpcUrl: "https://rpc.example",
        chainId: 11155111,
        pinataJwt: "test",
      }),
    );

    try {
      process.chdir(directory);
      assert.throws(() => readConfig(), /deployedAtBlock is missing/);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
