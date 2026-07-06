import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";

const REPO = "Team-Managed/fheENV";

// Injected at build time — matches package.json version
const CURRENT_VERSION = "0.1.0";

// ── Platform / arch detection ─────────────────────────────────────────────────

function getAssetName(): string {
  const plat = process.platform;
  const arch = process.arch; // "x64" or "arm64" (correct even under Rosetta)

  if (plat === "darwin") {
    return arch === "arm64" ? "fheenv-macos-arm64" : "fheenv-macos-x64";
  }
  if (plat === "linux") {
    return arch === "arm64" ? "fheenv-linux-arm64" : "fheenv-linux-x64";
  }
  if (plat === "win32") {
    return "fheenv-windows-x64.exe";
  }
  throw new Error(`Unsupported platform: ${plat}/${arch}`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type GithubRelease = {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
};

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "fheenv-cli", Accept: "application/json" } },
      (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location
        ) {
          return fetchJson(res.headers.location).then(resolve).catch(reject);
        }
        let buf = "";
        res.on("data", (c: Buffer) => (buf += c.toString()));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(e);
          }
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https
        .get(u, { headers: { "User-Agent": "fheenv-cli" } }, (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302) &&
            res.headers.location
          ) {
            return follow(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} downloading ${u}`));
          }
          const file = fs.createWriteStream(dest, { mode: 0o755 });
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
          file.on("error", (err) => {
            fs.unlink(dest, () => reject(err));
          });
        })
        .on("error", reject);
    };
    follow(url);
  });
}

// ── Atomic self-replace ───────────────────────────────────────────────────────

function replaceBinary(tmpPath: string, targetPath: string): void {
  if (process.platform === "win32") {
    // Windows: can't delete a running exe, but CAN rename it away
    const oldPath = targetPath + ".old";
    try {
      fs.unlinkSync(oldPath);
    } catch {
      /* ignore */
    }
    fs.renameSync(targetPath, oldPath);
    fs.renameSync(tmpPath, targetPath);
    // Leave the .old file; it'll be cleaned up on the next update
  } else {
    // macOS / Linux: rename is atomic and works over a running binary
    fs.renameSync(tmpPath, targetPath);
    fs.chmodSync(targetPath, 0o755);
  }
}

// ── Command ───────────────────────────────────────────────────────────────────

export async function updateCommand(): Promise<void> {
  // Safety: don't overwrite the Node.js binary when running in dev mode
  // @yao-pkg/pkg (and the original pkg) sets process.pkg on the process object
  const isPkg = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
  if (!isPkg) {
    console.log(
      chalk.yellow(
        "⚠  Running from source / npm link — skipping binary self-update.\n" +
          "   Run `pnpm run build && npm link` to update your dev install.",
      ),
    );
    return;
  }

  const spinner = ora("Checking for updates…").start();

  let release: GithubRelease;
  try {
    release = (await fetchJson(
      `https://api.github.com/repos/${REPO}/releases/latest`,
    )) as GithubRelease;
  } catch (err) {
    spinner.fail(chalk.red(`Could not reach GitHub: ${(err as Error).message}`));
    process.exit(1);
  }

  const latestTag = release.tag_name; // e.g. "v0.2.0"
  const latestVersion = latestTag.replace(/^v/, "");

  if (latestVersion === CURRENT_VERSION) {
    spinner.succeed(
      chalk.green(`Already up to date — ${chalk.bold(latestTag)}`),
    );
    return;
  }

  spinner.text =
    `Update available: ${chalk.yellow(`v${CURRENT_VERSION}`)} → ` +
    `${chalk.green(latestTag)}. Downloading…`;

  let assetName: string;
  try {
    assetName = getAssetName();
  } catch (err) {
    spinner.fail(chalk.red((err as Error).message));
    process.exit(1);
  }

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    spinner.fail(
      chalk.red(
        `No binary found for ${chalk.bold(assetName)} in release ${latestTag}.\n` +
          `  Available assets: ${release.assets.map((a) => a.name).join(", ")}`,
      ),
    );
    process.exit(1);
  }

  const tmpPath = path.join(os.tmpdir(), `fheenv-update-${Date.now()}`);
  try {
    await downloadFile(asset.browser_download_url, tmpPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    spinner.fail(chalk.red(`Download failed: ${(err as Error).message}`));
    process.exit(1);
  }

  try {
    replaceBinary(tmpPath, process.execPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    spinner.fail(
      chalk.red(
        `Could not replace binary: ${(err as Error).message}\n` +
          `  Try: sudo fheenv update`,
      ),
    );
    process.exit(1);
  }

  spinner.succeed(
    chalk.green(
      `✓ Updated to ${chalk.bold(latestTag)}! ` +
        `Open a new terminal to use the new version.`,
    ),
  );
}
