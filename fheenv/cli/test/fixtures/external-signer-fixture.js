#!/usr/bin/env node
"use strict";

const { setTimeout } = require("node:timers");

const mode = process.argv[2];
if (mode === "slow") {
  setTimeout(() => undefined, 10_000);
} else if (mode === "oversized") {
  process.stdout.write("x".repeat(1024 * 1024 + 1));
} else {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    const request = JSON.parse(input);
    process.stdout.write(
      `${JSON.stringify({
        protocolVersion: 1,
        requestId: request.requestId,
        address: "0x1111111111111111111111111111111111111111",
      })}\n`,
    );
  });
}
