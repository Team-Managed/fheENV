const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { migrateConfigV1ToV2, readConfigV2, validateConfigV2 } = require("../src/lib/config-v2");

function legacyConfig(pinataJwt) {
  return {
    projectId: 1,
    registryAddress: "0x1111111111111111111111111111111111111111",
    rpcUrl: "https://rpc.example",
    chainId: 11155111,
    pinataJwt,
    deployedAtBlock: 10,
  };
}

const productionMigration = {
  securityMode: "production",
  signer: {
    type: "walletconnect",
    credentialRef: "keyring://walletconnect/project-id",
    expectedAddress: "0x2222222222222222222222222222222222222222",
  },
};

describe("credential-free project config", function () {
  it("proves the production signer before replacing the legacy config", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migration-proof-"));
    const configPath = path.join(directory, ".fheenv.json");
    const legacy = legacyConfig("pinata-secret-canary");
    fs.writeFileSync(configPath, JSON.stringify(legacy));
    let proved = 0;
    await migrateConfigV1ToV2(configPath, {
      ...productionMigration,
      credentialRef: "keyring://storage/pinata/default",
      setCredential: async () => undefined,
      readCredential: async () => legacy.pinataJwt,
      proveSigner: async (config) => {
        proved += 1;
        assert.equal(config.signer.expectedAddress, productionMigration.signer.expectedAddress);
        assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).version, undefined);
      },
    });
    assert.equal(proved, 1);
    assert.equal(readConfigV2(configPath).version, 2);
  });

  it("keeps the legacy config when production signer proof fails", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migration-proof-fail-"));
    const configPath = path.join(directory, ".fheenv.json");
    const legacy = legacyConfig("pinata-secret-canary");
    fs.writeFileSync(configPath, JSON.stringify(legacy));
    await assert.rejects(
      migrateConfigV1ToV2(configPath, {
        ...productionMigration,
        credentialRef: "keyring://storage/pinata/default",
        setCredential: async () => undefined,
        readCredential: async () => legacy.pinataJwt,
        proveSigner: async () => {
          throw new Error("signer proof failed");
        },
      }),
      /signer proof failed/,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), legacy);
  });

  it("rejects WalletConnect credential collisions before writing any credential", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migration-collision-"));
    const configPath = path.join(directory, ".fheenv.json");
    fs.writeFileSync(configPath, JSON.stringify(legacyConfig("pinata-secret-canary")));
    let writes = 0;
    await assert.rejects(
      migrateConfigV1ToV2(configPath, {
        ...productionMigration,
        signer: {
          ...productionMigration.signer,
          credentialRef: "keyring://storage/pinata/default",
        },
        credentialRef: "keyring://storage/pinata/default",
        setCredential: async () => {
          writes += 1;
        },
        readCredential: async () => null,
      }),
      /require distinct destination references/,
    );
    assert.equal(writes, 0);
  });

  it("stores the secret before atomically removing it from config", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migrate-"));
    const configPath = path.join(directory, ".fheenv.json");
    const jwt = "pinata-secret-canary";
    fs.writeFileSync(configPath, JSON.stringify(legacyConfig(jwt)));
    const writes = [];

    await migrateConfigV1ToV2(configPath, {
      ...productionMigration,
      credentialRef: "keyring://storage/pinata/default",
      setCredential: async (_reference, value) => writes.push(value),
      readCredential: async () => jwt,
    });

    assert.deepEqual(writes, [jwt]);
    const migratedText = fs.readFileSync(configPath, "utf8");
    assert.doesNotMatch(migratedText, /pinata-secret-canary|pinataJwt/);
    assert.equal(readConfigV2(configPath).version, 2);
  });

  it("leaves the original untouched when credential verification fails", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migrate-"));
    const configPath = path.join(directory, ".fheenv.json");
    const original = JSON.stringify(legacyConfig("original-canary"));
    fs.writeFileSync(configPath, original);

    await assert.rejects(
      migrateConfigV1ToV2(configPath, {
        ...productionMigration,
        credentialRef: "keyring://storage/pinata/default",
        setCredential: async () => undefined,
        readCredential: async () => "wrong-value",
      }),
      /verification failed/i,
    );

    assert.equal(fs.readFileSync(configPath, "utf8"), original);
  });

  it("returns a value-free dry-run without writing the credential", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migrate-"));
    const configPath = path.join(directory, ".fheenv.json");
    fs.writeFileSync(configPath, JSON.stringify(legacyConfig("dry-run-canary")));
    let writes = 0;

    const result = await migrateConfigV1ToV2(configPath, {
      ...productionMigration,
      credentialRef: "keyring://storage/pinata/default",
      dryRun: true,
      setCredential: async () => {
        writes += 1;
      },
      readCredential: async () => "dry-run-canary",
    });

    assert.equal(writes, 0);
    assert.deepEqual(result, {
      fromVersion: 1,
      toVersion: 2,
      movedFields: ["pinataJwt"],
      destinationReferences: ["keyring://storage/pinata/default"],
      securityMode: "production",
      signerType: "walletconnect",
    });
    assert.match(fs.readFileSync(configPath, "utf8"), /dry-run-canary/);
  });

  it("rejects colliding storage and RPC credential destinations before writing", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migrate-"));
    const configPath = path.join(directory, ".fheenv.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ...legacyConfig("pinata-canary"),
        rpcUrl: "https://user:rpc-canary@rpc.example",
      }),
    );
    let writes = 0;
    await assert.rejects(
      migrateConfigV1ToV2(configPath, {
        ...productionMigration,
        credentialRef: "keyring://shared",
        rpcCredentialRef: "keyring://shared",
        setCredential: async () => {
          writes += 1;
        },
        readCredential: async () => null,
      }),
      /distinct destination/i,
    );
    assert.equal(writes, 0);
  });

  it("rejects credentials embedded in an RPC URL", function () {
    const config = {
      version: 2,
      projectId: 1,
      registryAddress: "0x1111111111111111111111111111111111111111",
      chainId: 11155111,
      rpc: { url: "https://user:password@rpc.example?api_key=secret" },
      deployedAtBlock: 10,
      securityMode: "production",
      signer: { type: "walletconnect", credentialRef: "env://WALLETCONNECT_PROJECT_ID" },
      storage: {
        provider: "pinata",
        credentialRef: "keyring://storage/pinata/default",
      },
    };
    assert.throws(() => validateConfigV2(config), /RPC URL/i);
  });

  it("rejects unknown fields that could retain legacy credentials", function () {
    const config = {
      version: 2,
      projectId: 1,
      registryAddress: "0x1111111111111111111111111111111111111111",
      chainId: 11155111,
      rpc: { url: "https://rpc.example" },
      deployedAtBlock: 10,
      securityMode: "development",
      signer: { type: "local-encrypted" },
      storage: {
        provider: "pinata",
        credentialRef: "keyring://storage/pinata/default",
      },
      pinataJwt: "must-not-survive",
    };
    assert.throws(() => validateConfigV2(config), /unexpected config field/i);
  });
});
