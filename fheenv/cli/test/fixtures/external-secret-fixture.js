#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  if (process.argv[2] === "ignore-term" || process.argv[2] === "descendant-ignore-term") {
    if (process.argv[2] === "descendant-ignore-term") {
      spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], {
        stdio: "inherit",
      });
    }
    process.on("SIGTERM", () => undefined);
    globalThis.setInterval(() => undefined, 1_000);
    return;
  }
  if (process.argv[2] === "fail-control") {
    process.stderr.write("\u001b[31muntrusted\u0000detail\u001b[0m");
    process.exitCode = 3;
    return;
  }
  const request = JSON.parse(input);
  process.stdout.write(
    `${JSON.stringify({
      protocolVersion: 1,
      requestId: request.requestId,
      value: "external-secret-canary",
    })}\n`,
  );
});
