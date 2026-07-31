const assert = require("node:assert/strict");
const { parseTransaction, recoverTransactionAddress } = require("viem");
const { AwsKmsSignerProvider } = require("../src/lib/signers/aws-kms");

const enabled = process.env.FHEENV_AWS_KMS_TEST === "1";
if (!enabled) {
  process.stdout.write("AWS KMS integration skipped; set FHEENV_AWS_KMS_TEST=1.\n");
}

(enabled ? describe : describe.skip)("AWS KMS live integration", function () {
  this.timeout(120_000);

  it("retrieves the key and signs a zero-value transaction without broadcasting", async function () {
    const keyId = process.env.FHEENV_AWS_KMS_KEY_ARN;
    const expectedAddress = process.env.FHEENV_AWS_KMS_EXPECTED_ADDRESS;
    assert.ok(keyId, "FHEENV_AWS_KMS_KEY_ARN is required");
    assert.ok(expectedAddress, "FHEENV_AWS_KMS_EXPECTED_ADDRESS is required");
    const destination = "0x1111111111111111111111111111111111111111";
    const provider = new AwsKmsSignerProvider({
      keyId,
      policy: {
        chainIds: [11155111],
        contracts: { [destination]: ["0x12345678"] },
        maxValueWei: "0",
        maxGas: "100000",
        maxFeePerGasWei: "100000000000",
      },
    });
    const session = await provider.connect({
      chain: {
        id: 11155111,
        name: "Sepolia",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
      },
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      expectedAddress,
    });
    try {
      const serialized = await session.walletClient.account.signTransaction({
        chainId: 11155111,
        to: destination,
        data: "0x12345678",
        gas: 100_000n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
        nonce: 0,
        value: 0n,
      });
      const transaction = parseTransaction(serialized);
      assert.equal(transaction.to.toLowerCase(), destination.toLowerCase());
      assert.equal(transaction.value, 0n);
      assert.equal(
        (await recoverTransactionAddress({ serializedTransaction: serialized })).toLowerCase(),
        expectedAddress.toLowerCase(),
      );
    } finally {
      await session.close();
    }
  });
});
