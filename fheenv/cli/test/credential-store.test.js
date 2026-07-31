const assert = require("node:assert/strict");
const { SensitiveValueRegistry } = require("../src/lib/redaction");
const {
  NativeCredentialStore,
  parseCredentialReference,
  resolveCredential,
} = require("../src/lib/credential-store");
const path = require("node:path");
const { ExecutableSecretProvider } = require("../src/lib/external-secret-provider");

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

  it("resolves exec references through a bounded absolute executable", async function () {
    const fixture = path.resolve("cli/test/fixtures/external-secret-fixture.js");
    const provider = new ExecutableSecretProvider(
      {
        FHEENV_SECRET_PROVIDER_TEST: process.execPath,
        FHEENV_SECRET_PROVIDER_TEST_ARGS: JSON.stringify([fixture]),
      },
      2_000,
    );
    assert.equal(await provider.resolve("test", "storage/default"), "external-secret-canary");
  });

  it("escalates a timed-out provider to SIGKILL and waits for termination", async function () {
    const fixture = path.resolve("cli/test/fixtures/external-secret-fixture.js");
    const provider = new ExecutableSecretProvider(
      {
        FHEENV_SECRET_PROVIDER_TEST: process.execPath,
        FHEENV_SECRET_PROVIDER_TEST_ARGS: JSON.stringify([fixture, "descendant-ignore-term"]),
      },
      25,
      25,
    );
    const startedAt = Date.now();
    await assert.rejects(provider.resolve("test", "storage/default"), /SECRET_PROVIDER_TIMEOUT/);
    assert.ok(Date.now() - startedAt < 500, "timeout must not wait on descendant-owned pipes");
  });

  it("strips control characters from untrusted provider stderr", async function () {
    const fixture = path.resolve("cli/test/fixtures/external-secret-fixture.js");
    const provider = new ExecutableSecretProvider(
      {
        FHEENV_SECRET_PROVIDER_TEST: process.execPath,
        FHEENV_SECRET_PROVIDER_TEST_ARGS: JSON.stringify([fixture, "fail-control"]),
      },
      2_000,
    );
    await assert.rejects(provider.resolve("test", "storage/default"), (error) => {
      assert.match(error.message, /SECRET_PROVIDER_FAILED/);
      assert.equal(error.message.includes(String.fromCharCode(0)), false);
      assert.equal(error.message.includes(String.fromCharCode(27)), false);
      return true;
    });
  });
});
