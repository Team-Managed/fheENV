const assert = require("node:assert/strict");
const { AwsKmsSignerProvider, completeKmsSignature } = require("../src/lib/signers/aws-kms");

describe("AWS KMS signer", function () {
  it("parses DER, normalizes low-s, and recovers the configured address", function () {
    const fixture = require("./fixtures/aws-kms-secp256k1.json");
    const signature = completeKmsSignature({
      digest: fixture.digest,
      publicKeyDer: Buffer.from(fixture.publicKeyDer, "hex"),
      signatureDer: Buffer.from(fixture.signatureDer, "hex"),
      expectedAddress: fixture.address,
    });
    assert.equal(signature.recoveredAddress.toLowerCase(), fixture.address.toLowerCase());
    assert.equal(BigInt(signature.s) <= BigInt(fixture.halfCurveOrder), true);
  });

  it("rejects an unapproved destination before calling KMS", async function () {
    let calls = 0;
    const fixture = require("./fixtures/aws-kms-secp256k1.json");
    const provider = new AwsKmsSignerProvider({
      kms: {
        getPublicKey: async () => Buffer.from(fixture.publicKeyDer, "hex"),
        signDigest: async () => {
          calls += 1;
          return Buffer.from(fixture.signatureDer, "hex");
        },
      },
      keyId: "arn:aws:kms:us-east-1:111122223333:key/test",
      policy: fixture.policy,
    });
    const session = await provider.connect({
      chain: {
        id: 11155111,
        name: "Sepolia",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.example"] } },
      },
      rpcUrl: "https://rpc.example",
      expectedAddress: fixture.address,
    });
    await assert.rejects(
      session.walletClient.account.signTransaction({
        chainId: 11155111,
        to: "0x2222222222222222222222222222222222222222",
        data: "0x12345678",
        gas: 100_000n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
        nonce: 0,
        value: 0n,
      }),
      /destination is not allowed/i,
    );
    assert.equal(calls, 0);
  });
});
