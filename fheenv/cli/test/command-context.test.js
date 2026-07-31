const assert = require("node:assert/strict");
const { createCommandContext, withCommandContext } = require("../src/lib/command-context");

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

  it("redacts operation and close errors at the shared command boundary", async function () {
    for (const failAt of ["operation", "close"]) {
      await assert.rejects(
        withCommandContext(
          async () => ({
            sanitize: () => "safe redacted error",
            close: async () => {
              if (failAt === "close") throw new Error("wc:topic?symKey=close-canary");
            },
          }),
          async () => {
            if (failAt === "operation") {
              throw new Error("https://user:secret@example.test/rpc");
            }
          },
        ),
        (error) => {
          assert.equal(error.message, "safe redacted error");
          assert.doesNotMatch(error.message, /secret|symKey|canary/);
          return true;
        },
      );
    }
  });

  it("redacts a credential resolved during the actual command operation", async function () {
    const address = "0x1111111111111111111111111111111111111111";
    const config = {
      version: 2,
      projectId: 1,
      registryAddress: address,
      chainId: 11155111,
      rpc: { url: "https://rpc.example" },
      securityMode: "production",
      signer: {
        type: "aws-kms",
        keyId: "test",
        expectedAddress: address,
      },
      storage: {
        provider: "pinata",
        credentialRef: "keyring://storage/pinata/default",
      },
    };
    await assert.rejects(
      withCommandContext(
        () =>
          createCommandContext(config, {
            keyring: {
              get: async () => "pinata-secret-canary",
              set: async () => undefined,
              delete: async () => undefined,
              probe: async () => ({ available: true, backend: "memory" }),
            },
            signerProviders: {
              "aws-kms": {
                connect: async () => ({
                  type: "aws-kms",
                  address,
                  walletClient: {},
                  capabilities: {
                    transactions: true,
                    messages: true,
                    typedData: true,
                  },
                  close: async () => undefined,
                }),
              },
            },
            createPublicClient: () => ({}),
          }),
        async (context) => {
          const credential = await context.credentials.storage();
          throw new Error(`provider rejected ${credential}`);
        },
      ),
      (error) => {
        assert.doesNotMatch(error.message, /pinata-secret-canary/);
        assert.match(error.message, /REDACTED/);
        return true;
      },
    );
  });
});
