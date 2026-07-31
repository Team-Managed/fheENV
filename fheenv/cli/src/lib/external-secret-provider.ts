import { spawn } from "child_process";
import crypto from "crypto";
import path from "path";
import { SensitiveValueRegistry, sanitizeError } from "./redaction";

const LIMIT = 1024 * 1024;

function stripControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      if (character === "\n" || character === "\r" || character === "\t") return true;
      return !/[\p{Cc}\p{Cf}]/u.test(character);
    })
    .join("");
}

export class ExecutableSecretProvider {
  constructor(
    private readonly environment:
      NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
    private readonly timeoutMs = 30_000,
    private readonly killAfterMs = 2_000,
  ) {}

  async resolve(provider: string, key: string): Promise<string | null> {
    const prefix = `FHEENV_SECRET_PROVIDER_${provider.replace(/-/g, "_").toUpperCase()}`;
    const executable = this.environment[prefix];
    if (!executable || !path.isAbsolute(executable)) {
      throw new Error(`Secret provider ${provider} requires an absolute executable path.`);
    }
    let executableArgs: string[] = [];
    const encodedArgs = this.environment[`${prefix}_ARGS`];
    if (encodedArgs) {
      const parsed = JSON.parse(encodedArgs) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
        throw new Error(`Secret provider ${provider} arguments must be a JSON string array.`);
      }
      executableArgs = parsed;
    }
    const allowed = (this.environment[`${prefix}_ALLOW_ENV`] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const names = new Set([
      "PATH",
      "HOME",
      "USERPROFILE",
      "SYSTEMROOT",
      "TMPDIR",
      "TEMP",
      "TMP",
      ...allowed,
    ]);
    const env = Object.fromEntries(
      [...names]
        .filter((name) => this.environment[name] !== undefined)
        .map((name) => [name, this.environment[name] as string]),
    );
    const registry = new SensitiveValueRegistry();
    for (const value of Object.values(env)) registry.register(value);
    const requestId = crypto.randomUUID();
    const request = `${JSON.stringify({
      protocolVersion: 1,
      requestId,
      operation: "resolveCredential",
      key,
    })}\n`;
    if (Buffer.byteLength(request) > LIMIT) {
      throw new Error("SECRET_PROVIDER_REQUEST_LIMIT: request exceeds 1 MiB.");
    }

    return new Promise<string>((resolve, reject) => {
      const child = spawn(executable, executableArgs, {
        shell: false,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let bytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let pendingError: Error | undefined;
      let killTimer: NodeJS.Timeout | undefined;
      const settle = (error?: Error, value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (killTimer && pendingError === undefined) clearTimeout(killTimer);
        if (error) reject(error);
        else resolve(value as string);
      };
      const signalProcessTree = (signal: NodeJS.Signals) => {
        if (process.platform === "win32" && child.pid !== undefined) {
          const taskkill = spawn(
            "taskkill",
            ["/pid", String(child.pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])],
            { shell: false, stdio: "ignore", windowsHide: true },
          );
          taskkill.on("error", () => child.kill(signal));
          return;
        }
        if (process.platform !== "win32" && child.pid !== undefined) {
          try {
            process.kill(-child.pid, signal);
            return;
          } catch {
            // Fall back to the direct process when its process group no longer exists.
          }
        }
        child.kill(signal);
      };
      const terminate = (error: Error) => {
        if (pendingError || settled) return;
        pendingError = error;
        signalProcessTree("SIGTERM");
        killTimer = setTimeout(
          () => {
            signalProcessTree("SIGKILL");
          },
          Math.min(Math.max(1, this.killAfterMs), 10_000),
        );
      };
      const timer = setTimeout(
        () => terminate(new Error("SECRET_PROVIDER_TIMEOUT: provider exceeded its deadline.")),
        Math.min(Math.max(1, this.timeoutMs), 120_000),
      );
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > LIMIT) {
          terminate(new Error("SECRET_PROVIDER_OUTPUT_LIMIT: stdout exceeds 1 MiB."));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrBytes >= 8_192) return;
        const remaining = 8_192 - stderrBytes;
        stderr.push(chunk.subarray(0, remaining));
        stderrBytes += Math.min(chunk.length, remaining);
      });
      child.on("error", (error) => {
        pendingError = new Error(`SECRET_PROVIDER_START_FAILED: ${error.message}`);
      });
      child.on("exit", () => {
        if (!pendingError || settled) return;
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        settle(pendingError);
      });
      child.on("close", (code) => {
        if (settled) return;
        if (pendingError) {
          settle(pendingError);
          return;
        }
        if (code !== 0) {
          const detail = sanitizeError(
            stripControlCharacters(Buffer.concat(stderr).toString("utf8")),
            registry,
          );
          settle(
            new Error(
              `SECRET_PROVIDER_FAILED: provider exited with code ${code}.${detail ? ` ${detail}` : ""}`,
            ),
          );
          return;
        }
        const output = Buffer.concat(stdout).toString("utf8");
        if (!output.endsWith("\n") || output.slice(0, -1).includes("\n")) {
          settle(new Error("SECRET_PROVIDER_INVALID_RESPONSE: expected one JSON line."));
          return;
        }
        try {
          const response = JSON.parse(output) as {
            protocolVersion?: unknown;
            requestId?: unknown;
            value?: unknown;
          };
          if (
            response.protocolVersion !== 1 ||
            response.requestId !== requestId ||
            typeof response.value !== "string" ||
            !response.value
          ) {
            throw new Error("response identity or value is invalid.");
          }
          settle(undefined, response.value);
        } catch {
          settle(new Error("SECRET_PROVIDER_INVALID_RESPONSE: invalid provider response."));
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(request);
    });
  }
}
