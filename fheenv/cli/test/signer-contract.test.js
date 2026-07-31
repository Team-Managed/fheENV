const assert = require("node:assert/strict");
const { assertSignerCapabilities, createSignerSession } = require("../src/lib/signer-types");
const { LocalEncryptedSignerProvider } = require("../src/lib/signers/local-encrypted");
const { createCommandContext } = require("../src/lib/command-context");

describe("signer provider contract", function () {
  it("rejects a signer missing typed-data support before CoFHE work starts", function () {
    assert.throws(
      () =>
        assertSignerCapabilities({ transactions: true, messages: true, typedData: false }, [
          "transactions",
          "typedData",
        ]),
      /typedData/,
    );
  });

  it("closes each session exactly once", async function () {
    let closes = 0;
    const session = createSignerSession({
      type: "local-encrypted",
      address: "0x1111111111111111111111111111111111111111",
      walletClient: {},
      capabilities: { transactions: true, messages: true, typedData: true },
      close: async () => {
        closes += 1;
      },
    });
    await session.close();
    await session.close();
    assert.equal(closes, 1);
  });

  it("rejects the local encrypted signer in production", async function () {
    const provider = new LocalEncryptedSignerProvider({
      securityMode: "production",
      createClients: () => {
        throw new Error("must not load a private key");
      },
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
      }),
      /disabled in production/i,
    );
  });

  it("warns when development mode uses a raw private-key environment value", async function () {
    const warnings = [];
    const provider = new LocalEncryptedSignerProvider({
      securityMode: "development",
      environment: { FHEENV_PRIVATE_KEY: `0x${"11".repeat(32)}` },
      warn: (message) => warnings.push(message),
      createClients: () => ({
        account: { address: "0x1111111111111111111111111111111111111111" },
        publicClient: {},
        walletClient: {},
      }),
    });
    const session = await provider.connect({
      chain: { id: 11155111 },
      rpcUrl: "https://rpc.example",
    });
    assert.equal(session.capabilities.typedData, true);
    assert.match(warnings.join("\n"), /raw private key/i);
  });

  it("closes a connected signer when context setup fails", async function () {
    let closes = 0;
    const provider = {
      connect: async () =>
        createSignerSession({
          type: "walletconnect",
          address: "0x1111111111111111111111111111111111111111",
          walletClient: {},
          capabilities: {
            transactions: true,
            messages: true,
            typedData: false,
          },
          close: async () => {
            closes += 1;
          },
        }),
    };
    await assert.rejects(
      createCommandContext(
        {
          version: 2,
          projectId: 1,
          registryAddress: "0x1111111111111111111111111111111111111111",
          chainId: 11155111,
          rpc: { url: "https://rpc.example" },
          securityMode: "production",
          signer: {
            type: "walletconnect",
            credentialRef: "env://WALLETCONNECT_PROJECT_ID",
          },
          storage: {
            provider: "pinata",
            credentialRef: "keyring://storage/pinata/default",
          },
        },
        {
          signerProviders: { walletconnect: provider },
          createPublicClient: () => ({}),
        },
      ),
      /typedData/,
    );
    assert.equal(closes, 1);
  });
});
