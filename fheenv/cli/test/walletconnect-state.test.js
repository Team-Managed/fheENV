const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WalletConnectStateStore } = require("../src/lib/walletconnect-state");

class MemoryStore {
  values = new Map();
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async set(key, value) {
    this.values.set(key, value);
  }
  async delete(key) {
    this.values.delete(key);
  }
  async probe() {
    return { available: true, backend: "memory" };
  }
}

describe("WalletConnect encrypted state", function () {
  it("round-trips state while keeping the encryption key out of the file", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-wc-state-"));
    const statePath = path.join(directory, "state.v1");
    const credentials = new MemoryStore();
    const store = new WalletConnectStateStore({
      statePath,
      credentials,
      installationId: "installation-1",
    });
    await store.save("session-secret-canary");
    const text = fs.readFileSync(statePath, "utf8");
    assert.doesNotMatch(text, /session-secret-canary/);
    assert.equal((await store.load()).state, "session-secret-canary");
    assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);
  });

  it("quarantines state when its authentication tag is corrupt", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-wc-state-"));
    const statePath = path.join(directory, "state.v1");
    const credentials = new MemoryStore();
    const store = new WalletConnectStateStore({
      statePath,
      credentials,
      installationId: "installation-1",
    });
    await store.save("session");
    const envelope = JSON.parse(fs.readFileSync(statePath, "utf8"));
    envelope.authTag = "00".repeat(16);
    fs.writeFileSync(statePath, JSON.stringify(envelope));
    const result = await store.load();
    assert.equal(result.state, null);
    assert.equal(result.warningCode, "WALLETCONNECT_STATE_CORRUPT");
    assert.equal(fs.existsSync(statePath), false);
    assert.equal(
      fs.readdirSync(directory).some((name) => name.includes(".corrupt-")),
      true,
    );
  });

  it("quarantines state when its keyring key is missing", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-wc-state-"));
    const statePath = path.join(directory, "state.v1");
    const credentials = new MemoryStore();
    const store = new WalletConnectStateStore({
      statePath,
      credentials,
      installationId: "installation-1",
    });
    await store.save("session");
    credentials.values.clear();
    const result = await store.load();
    assert.equal(result.state, null);
    assert.equal(result.warningCode, "WALLETCONNECT_STATE_KEY_MISSING");
    assert.equal(fs.existsSync(statePath), false);
  });
});
