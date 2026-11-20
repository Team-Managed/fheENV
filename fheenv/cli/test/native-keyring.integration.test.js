const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { NativeCredentialStore } = require("../src/lib/credential-store");

const enabled = process.env.FHEENV_NATIVE_KEYRING_TEST === "1";
if (!enabled) {
  process.stdout.write("Native keyring integration skipped; set FHEENV_NATIVE_KEYRING_TEST=1.\n");
}

(enabled ? describe : describe.skip)("native keyring integration", function () {
  it("creates, replaces, reads, and deletes a credential", async function () {
    const store = new NativeCredentialStore();
    const key = `integration/${crypto.randomUUID()}`;
    const first = crypto.randomBytes(32).toString("base64");
    const replacement = crypto.randomBytes(32).toString("base64");
    try {
      const probe = await store.probe();
      assert.equal(probe.available, true, probe.reason);
      await store.set(key, first);
      assert.equal(await store.get(key), first);
      await store.set(key, replacement);
      assert.equal(await store.get(key), replacement);
      await store.delete(key);
      assert.equal(await store.get(key), null);
    } finally {
      await store.delete(key).catch(() => undefined);
    }
  });
});
