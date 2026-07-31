#!/usr/bin/env node
"use strict";

const { setTimeout } = require("node:timers");

const mode = process.argv[2];
if (mode === "slow") {
  setTimeout(() => undefined, 10_000);
} else if (mode === "oversized") {
  process.stdout.write("x".repeat(1024 * 1024 + 1));
} else if (mode === "secret-error") {
  process.stderr.write("wc:topic@2?relay-protocol=irn&symKey=secret-canary");
  process.exitCode = 1;
} else {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    const request = JSON.parse(input);
    const respond = () =>
      process.stdout.write(
        `${JSON.stringify({
          protocolVersion: 1,
          requestId: request.requestId,
          address: "0x1111111111111111111111111111111111111111",
        })}\n`,
      );
    if (request.payload?.slow) setTimeout(respond, 10_000);
    else respond();
  });
}
