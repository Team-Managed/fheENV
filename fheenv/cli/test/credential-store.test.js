const assert = require("node:assert/strict");
const { SensitiveValueRegistry } = require("../src/lib/redaction");
const {
  NativeCredentialStore,
  parseCredentialReference,
  resolveCredential,
} = require("../src/lib/credential-store");

class MemoryBackend {
  values = new Map();

  async get(service, account) {
    return this.values.get(`${service}:${account}`) ?? null;
  }

  async set(service, account, value) {
    this.values.set(`${service}:${account}`, value);
  }

  async delete(service, account) {
    this.values.delete(`${service}:${account}`);
  }
}

describe("credential storage", function () {
  it("round-trips an opaque keyring reference", async function () {
    const store = new NativeCredentialStore(new MemoryBackend());
    await store.set("storage/pinata/default", "secret-canary");
    assert.equal(await store.get("storage/pinata/default"), "secret-canary");
    await store.delete("storage/pinata/default");
    assert.equal(await store.get("storage/pinata/default"), null);
  });

  it("resolves only the explicitly selected source", async function () {
    const store = new NativeCredentialStore(new MemoryBackend());
    await store.set("storage/pinata/default", "keyring-value");
    const value = await resolveCredential(
      parseCredentialReference("keyring://storage/pinata/default"),
      {
        keyring: store,
        environment: { FHEENV_PINATA_JWT: "environment-value" },
      },
    );
    assert.equal(value, "keyring-value");
  });

  it("rejects raw private-key environment references in production", async function () {
    await assert.rejects(
      resolveCredential(parseCredentialReference("env://FHEENV_PRIVATE_KEY"), {
        mode: "production",
        environment: { FHEENV_PRIVATE_KEY: `0x${"11".repeat(32)}` },
      }),
      /private-key environment references are disabled in production/i,
    );
  });

  it("rejects traversal, control characters, and invalid environment names", function () {
    for (const reference of [
      "keyring://storage/../private-key",
      "keyring://storage/\nprivate-key",
      "env://lowercase",
      "exec://provider/",
    ]) {
      assert.throws(() => parseCredentialReference(reference), /invalid credential reference/i);
    }
  });

  it("registers resolved values for redaction", async function () {
    const registry = new SensitiveValueRegistry();
    const value = await resolveCredential(parseCredentialReference("env://FHEENV_PINATA_JWT"), {
      environment: { FHEENV_PINATA_JWT: "secret-canary" },
      registry,
    });
    assert.equal(value, "secret-canary");
    assert.equal(registry.redact(value), "[REDACTED]");
  });
});
