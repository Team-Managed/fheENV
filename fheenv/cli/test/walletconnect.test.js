const assert = require("node:assert/strict");
const { WalletConnectSignerProvider } = require("../src/lib/signers/walletconnect");

describe("WalletConnect signer", function () {
  it("never logs the pairing URI and verifies the selected account", async function () {
    const rendered = [];
    const output = [];
    const provider = new WalletConnectSignerProvider({
      projectId: "project-id",
      createProvider: async () => ({
        accounts: ["0x1111111111111111111111111111111111111111"],
        chainId: 11155111,
        on(event, listener) {
          if (event === "display_uri") {
            listener("wc:topic@2?relay-protocol=irn&symKey=secret-canary");
          }
        },
        connect: async () => undefined,
        disconnect: async () => undefined,
        request: async () => "0xtransaction",
      }),
      renderQr: (uri) => rendered.push(uri),
      writeOutput: (message) => output.push(message),
    });
    const session = await provider.connect({
      chain: { id: 11155111 },
      rpcUrl: "https://rpc.example",
      expectedAddress: "0x1111111111111111111111111111111111111111",
    });
    assert.equal(rendered.length, 1);
    assert.doesNotMatch(output.join("\n"), /wc:|secret-canary/);
    assert.equal(session.address.toLowerCase(), "0x1111111111111111111111111111111111111111");
  });

  it("rejects wrong-chain sessions", async function () {
    let disconnected = 0;
    const provider = new WalletConnectSignerProvider({
      projectId: "project-id",
      createProvider: async () => ({
        accounts: ["0x1111111111111111111111111111111111111111"],
        chainId: 84532,
        on() {},
        connect: async () => undefined,
        disconnect: async () => {
          disconnected += 1;
        },
        request: async () => "0xtransaction",
      }),
      renderQr: () => undefined,
      writeOutput: () => undefined,
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
      }),
      /wrong chain/i,
    );
    assert.equal(disconnected, 1);
  });

  it("times out pairing and disconnects the provider", async function () {
    let disconnected = 0;
    const provider = new WalletConnectSignerProvider({
      projectId: "project-id",
      timeoutMs: 10,
      createProvider: async () => ({
        accounts: [],
        chainId: 11155111,
        on() {},
        connect: () => new Promise(() => undefined),
        disconnect: async () => {
          disconnected += 1;
        },
        request: async () => undefined,
      }),
      renderQr: () => undefined,
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
      }),
      /WALLETCONNECT_TIMEOUT/,
    );
    assert.equal(disconnected, 1);
  });

  for (const [name, response, expected] of [
    ["wallet rejection", Object.assign(new Error("rejected"), { code: 4001 }), "WALLET_REJECTED"],
    ["invalid response", "not-a-hash", "WALLETCONNECT_INVALID_RESPONSE"],
  ]) {
    it(`returns a stable error for ${name}`, async function () {
      const provider = new WalletConnectSignerProvider({
        projectId: "project-id",
        createProvider: async () => ({
          accounts: ["0x1111111111111111111111111111111111111111"],
          chainId: 11155111,
          on() {},
          connect: async () => undefined,
          disconnect: async () => undefined,
          request: async ({ method }) => {
            if (method === "eth_sendTransaction") {
              if (response instanceof Error) throw response;
              return response;
            }
            if (method === "eth_chainId") return "0xaa36a7";
            if (method === "eth_getTransactionCount") return "0x0";
            if (method === "eth_estimateGas") return "0x5208";
            if (method === "eth_gasPrice") return "0x1";
            return "0x0";
          },
        }),
        renderQr: () => undefined,
        writeOutput: () => undefined,
      });
      const session = await provider.connect({
        chain: {
          id: 11155111,
          name: "Sepolia",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: ["https://rpc.example"] } },
        },
        rpcUrl: "https://rpc.example",
      });
      await assert.rejects(
        session.walletClient.sendTransaction({
          to: "0x2222222222222222222222222222222222222222",
          value: 0n,
        }),
        new RegExp(expected),
      );
      await session.close();
    });
  }

  it("rejects an outstanding request when the provider disconnects", async function () {
    const listeners = new Map();
    const provider = new WalletConnectSignerProvider({
      projectId: "project-id",
      createProvider: async () => ({
        accounts: ["0x1111111111111111111111111111111111111111"],
        chainId: 11155111,
        on(event, listener) {
          listeners.set(event, listener);
        },
        connect: async () => undefined,
        disconnect: async () => undefined,
        request: async ({ method }) => {
          if (method === "eth_sendTransaction") {
            process.nextTick(() => listeners.get("disconnect")());
            return new Promise(() => undefined);
          }
          if (method === "eth_chainId") return "0xaa36a7";
          if (method === "eth_getTransactionCount") return "0x0";
          if (method === "eth_estimateGas") return "0x5208";
          if (method === "eth_gasPrice") return "0x1";
          return "0x0";
        },
      }),
      renderQr: () => undefined,
      writeOutput: () => undefined,
    });
    const session = await provider.connect({
      chain: {
        id: 11155111,
        name: "Sepolia",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.example"] } },
      },
      rpcUrl: "https://rpc.example",
    });
    await assert.rejects(
      session.walletClient.sendTransaction({
        to: "0x2222222222222222222222222222222222222222",
        value: 0n,
      }),
      /WALLETCONNECT_DISCONNECTED/,
    );
  });
});
