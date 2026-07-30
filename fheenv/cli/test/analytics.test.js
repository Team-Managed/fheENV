const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  captureAnalytics,
  disableAnalytics,
  enableAnalytics,
  getAnalyticsStatus,
} = require("../src/lib/analytics");

describe("opt-in analytics", function () {
  let directory;
  let settingsPath;

  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-analytics-"));
    settingsPath = path.join(directory, "settings.json");
  });

  afterEach(function () {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("does not send or create an identifier before consent", async function () {
    const sent = [];

    await captureAnalytics(
      "cli_initialized",
      {},
      { settingsPath, send: async (body) => sent.push(body) },
    );

    assert.deepEqual(sent, []);
    assert.equal(fs.existsSync(settingsPath), false);
  });

  it("sends only allowlisted properties after consent", async function () {
    enableAnalytics(settingsPath);
    const sent = [];

    await captureAnalytics(
      "rotation_completed",
      {
        success: true,
        durationBucket: "1-5s",
        wallet: "0xsecret",
        envName: "production",
      },
      { settingsPath, send: async (body) => sent.push(body) },
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].event, "rotation_completed");
    assert.equal(sent[0].properties.success, true);
    assert.equal(sent[0].properties.durationBucket, "1-5s");
    assert.equal(sent[0].properties.wallet, undefined);
    assert.equal(sent[0].properties.envName, undefined);
    assert.match(sent[0].distinct_id, /^[0-9a-f-]{36}$/);
  });

  it("ignores transport failure", async function () {
    enableAnalytics(settingsPath);

    await captureAnalytics(
      "cli_initialized",
      {},
      {
        settingsPath,
        send: async () => {
          throw new Error("offline");
        },
      },
    );
  });

  it("can be disabled and does not retain the identifier", function () {
    enableAnalytics(settingsPath);
    assert.equal(getAnalyticsStatus(settingsPath).enabled, true);

    disableAnalytics(settingsPath);

    assert.deepEqual(getAnalyticsStatus(settingsPath), { enabled: false });
    assert.equal(fs.existsSync(settingsPath), false);
  });

  it("rejects unknown event names", async function () {
    enableAnalytics(settingsPath);

    await assert.rejects(
      captureAnalytics(
        "wallet_address_uploaded",
        {},
        { settingsPath, send: async () => undefined },
      ),
      /Unknown analytics event/,
    );
  });
});
