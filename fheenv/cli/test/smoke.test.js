const assert = require("node:assert/strict");

describe("CLI test harness", function () {
  it("loads TypeScript CLI modules", function () {
    const config = require("../src/lib/config");
    assert.equal(typeof config.readConfig, "function");
  });
});
