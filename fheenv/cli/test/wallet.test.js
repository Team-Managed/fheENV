const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const wallet = require("../src/lib/wallet");

const privateKey = `0x${"11".repeat(32)}`;
const passphrase = "correct horse battery staple";

describe("encrypted wallet storage", function () {
  let directory;
  let walletPath;

  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-wallet-"));
    walletPath = path.join(directory, "wallet.json");
  });

  afterEach(function () {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function requireEncryptedApi() {
    assert.equal(typeof wallet.loadWallet, "function");
    assert.equal(typeof wallet.migrateLegacyWallet, "function");
  }

  it("never writes a new plaintext wallet", function () {
    requireEncryptedApi();
    wallet.saveWallet(privateKey, passphrase, walletPath);

    const file = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    assert.equal(file.version, 2);
    assert.equal("privateKey" in file, false);
    assert.equal(wallet.loadWallet(passphrase, walletPath), privateKey);
    assert.equal(fs.statSync(walletPath).mode & 0o777, 0o600);
  });

  it("rejects the wrong passphrase", function () {
    requireEncryptedApi();
    wallet.saveWallet(privateKey, passphrase, walletPath);

    assert.throws(() => wallet.loadWallet("wrong", walletPath), /incorrect passphrase/);
  });

  it("rejects a blank passphrase", function () {
    requireEncryptedApi();
    assert.throws(() => wallet.saveWallet(privateKey, "  ", walletPath), /Passphrase is required/);
  });

  it("migrates a legacy wallet without deleting it before replacement", function () {
    requireEncryptedApi();
    fs.writeFileSync(walletPath, JSON.stringify({ privateKey }), { mode: 0o600 });

    wallet.migrateLegacyWallet(passphrase, walletPath);

    assert.equal(wallet.loadWallet(passphrase, walletPath), privateKey);
    assert.equal(JSON.parse(fs.readFileSync(walletPath, "utf8")).version, 2);
  });

  it("refuses to load a legacy plaintext wallet normally", function () {
    requireEncryptedApi();
    fs.writeFileSync(walletPath, JSON.stringify({ privateKey }), { mode: 0o600 });

    assert.throws(() => wallet.loadWallet(passphrase, walletPath), /legacy plaintext wallet/);
  });
});
