const assert = require("node:assert/strict");
const { configureSigner } = require("../src/commands/signer");

describe("generated configuration safety", function () {
  const base = {
    version: 2,
    projectId: 7,
    registryAddress: "0x1111111111111111111111111111111111111111",
    chainId: 11155111,
    rpc: { credentialRef: "keyring://rpc/provider/default" },
    deployedAtBlock: 123,
    securityMode: "production",
    signer: {
      type: "aws-kms",
      keyId: "arn:aws:kms:us-east-1:111122223333:key/test",
      expectedAddress: "0x2222222222222222222222222222222222222222",
    },
    storage: {
      provider: "pinata",
      credentialRef: "keyring://storage/pinata/default",
    },
  };

  it("writes every production signer without credential values", async function () {
    const canaries = [
      "pinata-secret-canary",
      "rpc-secret-canary",
      "walletconnect-project-secret-canary",
      "wc:pairing@2?relay-protocol=irn&symKey=pairing-secret-canary",
      `0x${"ab".repeat(32)}`,
    ];
    const cases = [
      {
        type: "walletconnect",
        credential: "keyring://walletconnect/project-id",
      },
      { type: "ledger", derivationPath: "44'/60'/0'/0/0" },
      {
        type: "aws-kms",
        keyId: "arn:aws:kms:us-east-1:111122223333:key/replacement",
        expectedAddress: "0x3333333333333333333333333333333333333333",
      },
      {
        type: "external",
        provider: "custody",
        expectedAddress: "0x4444444444444444444444444444444444444444",
      },
    ];
    for (const options of cases) {
      let written;
      await configureSigner(options, {
        readConfig: () => base,
        proveSigner: async () => "0x5555555555555555555555555555555555555555",
        writeConfig: (config) => {
          written = JSON.stringify(config);
        },
      });
      assert.ok(written);
      for (const canary of canaries) assert.doesNotMatch(written, new RegExp(canary));
      assert.doesNotMatch(written, /pinataJwt|privateKey|symKey/);
    }
  });
});
