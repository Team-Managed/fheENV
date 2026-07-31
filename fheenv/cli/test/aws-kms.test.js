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

  it("rejects a KMS key different from the configured address", async function () {
    const fixture = require("./fixtures/aws-kms-secp256k1.json");
    const provider = new AwsKmsSignerProvider({
      kms: {
        getPublicKey: async () => Buffer.from(fixture.publicKeyDer, "hex"),
        signDigest: async () => assert.fail("signed with a mismatched key"),
      },
      keyId: "arn:aws:kms:us-east-1:111122223333:key/test",
      policy: fixture.policy,
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
        expectedAddress: "0x2222222222222222222222222222222222222222",
      }),
      /AWS_KMS_ADDRESS_MISMATCH/,
    );
  });

  it("signs and verifies transactions, messages, and EIP-712 data", async function () {
    const fixture = require("./fixtures/aws-kms-secp256k1.json");
    const { secp256k1 } = await import("@noble/curves/secp256k1.js");
    const provider = new AwsKmsSignerProvider({
      kms: {
        getPublicKey: async () => Buffer.from(fixture.publicKeyDer, "hex"),
        signDigest: async (digest) =>
          Buffer.from(
            secp256k1.sign(digest, Buffer.alloc(32, 0x11), {
              prehash: false,
              lowS: false,
              format: "der",
            }),
          ),
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
    assert.match(
      await session.walletClient.account.signTransaction({
        chainId: 11155111,
        to: "0x1111111111111111111111111111111111111111",
        data: "0x12345678",
        gas: 100_000n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
        nonce: 0,
        value: 0n,
      }),
      /^0x[0-9a-f]+$/i,
    );
    assert.match(
      await session.walletClient.signMessage({ message: "production proof" }),
      /^0x[0-9a-f]{130}$/i,
    );
    assert.match(
      await session.walletClient.signTypedData({
        domain: { name: "fheENV", version: "1", chainId: 11155111 },
        types: { Proof: [{ name: "projectId", type: "uint256" }] },
        primaryType: "Proof",
        message: { projectId: 1n },
      }),
      /^0x[0-9a-f]{130}$/i,
    );
  });
});
