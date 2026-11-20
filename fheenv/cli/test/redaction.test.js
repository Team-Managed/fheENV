const assert = require("node:assert/strict");
const { SensitiveValueRegistry, sanitizeError } = require("../src/lib/redaction");

describe("sensitive value redaction", function () {
  it("removes registered values, credential URLs, and WalletConnect URIs", function () {
    const registry = new SensitiveValueRegistry();
    registry.register("pinata-secret-canary");
    const error = new Error(
      "pinata-secret-canary https://user:pass@example.test/rpc?api_key=abc " +
        "wc:topic@2?relay-protocol=irn&symKey=deadbeef",
    );
    const output = sanitizeError(error, registry);
    assert.doesNotMatch(output, /pinata-secret-canary|user:pass|api_key=abc|symKey=deadbeef/);
    assert.match(output, /\[REDACTED\]/);
  });

  it("does not weaken redaction in debug mode", function () {
    const registry = new SensitiveValueRegistry();
    registry.register("debug-canary");
    const error = new Error("debug-canary");
    error.stack = "Error: debug-canary";
    assert.doesNotMatch(sanitizeError(error, registry, { debug: true }), /debug-canary/);
  });
});
