const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendAuditEvent, exportAuditRecords, toCsvCell } = require("../src/lib/audit");

describe("local audit records", function () {
  it("throws when a required audit write fails", function () {
    assert.throws(
      () =>
        appendAuditEvent(
          {
            action: "rotation_failed",
            projectId: "1",
            environment: "production",
            status: "failed",
            trigger: "manual",
          },
          "/dev/null/audit.log",
        ),
      /Unable to write local audit record/,
    );
  });

  it("escapes CSV cells deterministically", function () {
    assert.equal(toCsvCell('a,"b"'), '"a,""b"""');
  });

  it("exports timestamp-sorted records as stable CSV", function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-audit-"));
    const logPath = path.join(directory, "audit.log");

    try {
      fs.writeFileSync(
        logPath,
        [
          JSON.stringify({
            timestamp: "2026-07-31T02:00:00.000Z",
            action: "rotation_completed",
            projectId: "1",
            environment: "production",
            status: "success",
            trigger: "manual",
          }),
          JSON.stringify({
            timestamp: "2026-07-31T01:00:00.000Z",
            action: "member_revoked",
            projectId: "1",
            environment: "production",
            target: "0x1111111111111111111111111111111111111111",
            status: "success",
            trigger: "team_remove",
          }),
        ].join("\n"),
      );

      const csv = exportAuditRecords(logPath);
      const rows = csv.trim().split("\n");
      assert.equal(rows.length, 3);
      assert.match(rows[0], /^timestamp,action,/);
      assert.match(rows[1], /member_revoked/);
      assert.match(rows[2], /rotation_completed/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
