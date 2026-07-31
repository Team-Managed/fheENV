const assert = require("node:assert/strict");
const path = require("node:path");
const { ExternalSignerProvider } = require("../src/lib/signers/external");

describe("external signer protocol", function () {
  it("sends payload over stdin and verifies the response signer", async function () {
    const provider = new ExternalSignerProvider({
      executable: process.execPath,
      executableArgs: [path.resolve("cli/test/fixtures/external-signer-fixture.js")],
      expectedAddress: "0x1111111111111111111111111111111111111111",
      timeoutMs: 2_000,
    });
    const response = await provider.request({
      protocolVersion: 1,
      requestId: "00000000-0000-4000-8000-000000000001",
      operation: "getAddress",
      chainId: 11155111,
      expectedAddress: "0x1111111111111111111111111111111111111111",
      payload: {},
    });
    assert.equal(response.requestId, "00000000-0000-4000-8000-000000000001");
  });

  it("kills providers that exceed timeout or output limits", async function () {
    const fixture = path.resolve("cli/test/fixtures/external-signer-fixture.js");
    for (const [mode, expected] of [
      ["slow", /EXTERNAL_SIGNER_TIMEOUT/],
      ["oversized", /EXTERNAL_SIGNER_OUTPUT_LIMIT/],
    ]) {
      const provider = new ExternalSignerProvider({
        executable: process.execPath,
        executableArgs: [fixture, mode],
        expectedAddress: "0x1111111111111111111111111111111111111111",
        timeoutMs: 50,
      });
      await assert.rejects(
        provider.request({
          protocolVersion: 1,
          requestId: "00000000-0000-4000-8000-000000000001",
          operation: "getAddress",
          chainId: 11155111,
          expectedAddress: "0x1111111111111111111111111111111111111111",
          payload: {},
        }),
        expected,
      );
    }
  });

  it("rejects a provider response from a different signer", async function () {
    const provider = new ExternalSignerProvider({
      executable: process.execPath,
      executableArgs: [path.resolve("cli/test/fixtures/external-signer-fixture.js")],
      expectedAddress: "0x2222222222222222222222222222222222222222",
      timeoutMs: 2_000,
    });
    await assert.rejects(
      provider.request({
        protocolVersion: 1,
        requestId: "00000000-0000-4000-8000-000000000001",
        operation: "getAddress",
        chainId: 11155111,
        expectedAddress: "0x2222222222222222222222222222222222222222",
        payload: {},
      }),
      /EXTERNAL_SIGNER_INVALID_RESPONSE/,
    );
  });
});
