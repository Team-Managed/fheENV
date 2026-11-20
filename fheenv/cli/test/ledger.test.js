const assert = require("node:assert/strict");
const { keccak256, parseSignature, parseTransaction } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { LedgerSignerProvider } = require("../src/lib/signers/ledger");

describe("Ledger signer", function () {
  it("verifies the displayed device address", async function () {
    const provider = new LedgerSignerProvider({
      derivationPath: "44'/60'/0'/0/0",
      device: {
        getAddress: async () => "0x1111111111111111111111111111111111111111",
        signTransaction: async () => ({ r: "0x1", s: "0x2", v: 27 }),
        signMessage: async () => ({ r: "0x1", s: "0x2", v: 27 }),
        signTypedData: async () => ({ r: "0x1", s: "0x2", v: 27 }),
        close: async () => undefined,
      },
    });
    const session = await provider.connect({
      chain: { id: 11155111 },
      rpcUrl: "https://rpc.example",
      expectedAddress: "0x1111111111111111111111111111111111111111",
    });
    assert.equal(session.address.toLowerCase(), "0x1111111111111111111111111111111111111111");
  });

  it("fails before signing when the device address differs", async function () {
    let signs = 0;
    let closes = 0;
    const provider = new LedgerSignerProvider({
      derivationPath: "44'/60'/0'/0/0",
      device: {
        getAddress: async () => "0x2222222222222222222222222222222222222222",
        signTransaction: async () => {
          signs += 1;
        },
        close: async () => {
          closes += 1;
        },
      },
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
        expectedAddress: "0x1111111111111111111111111111111111111111",
      }),
      /LEDGER_ADDRESS_MISMATCH/,
    );
    assert.equal(signs, 0);
    assert.equal(closes, 1);
  });

  for (const [status, code] of [
    [0x6e00, "LEDGER_ETHEREUM_APP_REQUIRED"],
    [0x6985, "LEDGER_REJECTED"],
  ]) {
    it(`maps device status ${status.toString(16)} to ${code}`, async function () {
      const provider = new LedgerSignerProvider({
        derivationPath: "44'/60'/0'/0/0",
        device: {
          getAddress: async () => {
            throw { statusCode: status };
          },
          close: async () => undefined,
        },
      });
      await assert.rejects(
        provider.connect({
          chain: { id: 11155111 },
          rpcUrl: "https://rpc.example",
        }),
        new RegExp(code),
      );
    });
  }

  it("maps a disconnected device to a stable error", async function () {
    const provider = new LedgerSignerProvider({
      derivationPath: "44'/60'/0'/0/0",
      device: {
        getAddress: async () => {
          throw { code: "DEVICE_DISCONNECTED" };
        },
        close: async () => undefined,
      },
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
      }),
      /LEDGER_DISCONNECTED/,
    );
  });

  it("returns LEDGER_NOT_FOUND when discovery has no device", async function () {
    const provider = new LedgerSignerProvider({
      derivationPath: "44'/60'/0'/0/0",
      createDevice: async () => undefined,
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
      }),
      /LEDGER_NOT_FOUND/,
    );
  });

  it("locally verifies a device message signature", async function () {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const provider = new LedgerSignerProvider({
      derivationPath: "44'/60'/0'/0/0",
      device: {
        getAddress: async () => account.address,
        signMessage: async (_path, message) => {
          const signature = parseSignature(
            await account.signMessage({ message: { raw: message } }),
          );
          return {
            r: signature.r,
            s: signature.s,
            v: signature.yParity + 27,
          };
        },
        close: async () => undefined,
      },
    });
    const session = await provider.connect({
      chain: {
        id: 11155111,
        name: "Sepolia",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.example"] } },
      },
      rpcUrl: "https://rpc.example",
      expectedAddress: account.address,
    });
    assert.match(
      await session.walletClient.signMessage({ message: "hello" }),
      /^0x[0-9a-f]{130}$/i,
    );
    await session.close();
  });

  it("locally verifies transaction and EIP-712 signatures", async function () {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const asDeviceSignature = (signature) => {
      const parsed = parseSignature(signature);
      return { r: parsed.r, s: parsed.s, v: parsed.yParity + 27 };
    };
    const provider = new LedgerSignerProvider({
      derivationPath: "44'/60'/0'/0/0",
      device: {
        getAddress: async () => account.address,
        signTransaction: async (_path, serialized) => {
          const signed = parseTransaction(
            await account.signTransaction(parseTransaction(serialized)),
          );
          return {
            r: signed.r,
            s: signed.s,
            v: signed.yParity + 27,
          };
        },
        signTypedData: async (_path, typedData) =>
          asDeviceSignature(await account.signTypedData(typedData)),
        close: async () => undefined,
      },
    });
    const session = await provider.connect({
      chain: {
        id: 11155111,
        name: "Sepolia",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.example"] } },
      },
      rpcUrl: "https://rpc.example",
      expectedAddress: account.address,
    });
    const transaction = await session.walletClient.account.signTransaction({
      chainId: 11155111,
      to: "0x2222222222222222222222222222222222222222",
      gas: 21_000n,
      gasPrice: 1n,
      nonce: 0,
      value: 0n,
    });
    assert.match(keccak256(transaction), /^0x[0-9a-f]{64}$/i);
    assert.match(
      await session.walletClient.signTypedData({
        domain: { name: "fheENV", version: "1", chainId: 11155111 },
        types: { Proof: [{ name: "projectId", type: "uint256" }] },
        primaryType: "Proof",
        message: { projectId: 1n },
      }),
      /^0x[0-9a-f]{130}$/i,
    );
    await session.close();
  });
});
