const assert = require("node:assert/strict");
const { setCredential, credentialStatus } = require("../src/commands/credentials");
const { configureSigner } = require("../src/commands/signer");

describe("credential management commands", function () {
  it("stores hidden input and returns metadata only", async function () {
    const writes = [];
    const result = await setCredential(
      { reference: "keyring://storage/pinata/default" },
      {
        promptSecret: async () => "secret-canary",
        store: { set: async (key, value) => writes.push([key, value]) },
      },
    );
    assert.deepEqual(writes, [["storage/pinata/default", "secret-canary"]]);
    assert.deepEqual(result, {
      reference: "keyring://storage/pinata/default",
      stored: true,
    });
    assert.doesNotMatch(JSON.stringify(result), /secret-canary/);
  });

  it("reports only source, presence, and backend metadata", async function () {
    const result = await credentialStatus(
      { reference: "keyring://storage/pinata/default" },
      {
        store: {
          get: async () => "secret-canary",
          probe: async () => ({ available: true, backend: "test keyring" }),
        },
      },
    );
    assert.deepEqual(result, {
      reference: "keyring://storage/pinata/default",
      source: "keyring",
      present: true,
      backend: "test keyring",
    });
    assert.doesNotMatch(JSON.stringify(result), /secret-canary/);
  });
});

describe("signer management commands", function () {
  const config = {
    version: 2,
    projectId: 1,
    registryAddress: "0x1111111111111111111111111111111111111111",
    chainId: 11155111,
    rpc: { url: "https://rpc.example" },
    securityMode: "production",
    signer: {
      type: "aws-kms",
      keyId: "test",
      expectedAddress: "0x2222222222222222222222222222222222222222",
    },
    storage: {
      provider: "pinata",
      credentialRef: "keyring://storage/pinata/default",
    },
  };

  it("proves an interactive signer address before persisting it", async function () {
    let written;
    const result = await configureSigner(
      {
        type: "walletconnect",
        credential: "keyring://walletconnect/project-id",
      },
      {
        readConfig: () => config,
        proveSigner: async () => "0x3333333333333333333333333333333333333333",
        writeConfig: (value) => {
          written = value;
        },
      },
    );
    assert.equal(written.signer.expectedAddress, "0x3333333333333333333333333333333333333333");
    assert.equal(result.configured, true);
  });

  it("rejects the local encrypted signer in production", async function () {
    await assert.rejects(
      configureSigner(
        { type: "local-encrypted" },
        { readConfig: () => config, writeConfig: () => assert.fail("wrote config") },
      ),
      /development mode/i,
    );
  });
});
