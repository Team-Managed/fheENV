#!/usr/bin/env node
"use strict";

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
      value: "external-secret-canary",
    })}\n`,
  );
});
