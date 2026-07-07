import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";

const REPO = "Team-Managed/fheENV";

// Injected at build time — matches package.json version
const CURRENT_VERSION = "0.5.0";

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
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
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
        return;
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
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
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

// ── Windows: patch PowerShell profiles + Git Bash rc ─────────────────────────
// VS Code's integrated terminal inherits VS Code's environment at launch time.
// Writing to the Windows User PATH registry doesn't help for already-open VS Code
// windows. Patching the shell profile files ($PROFILE / .bashrc) makes the PATH
// available every time those terminals start a new session — including inside VS Code.

function patchWindowsProfiles(installDir: string): void {
  const home = os.homedir();
  const psLine = `$env:PATH = "${installDir};$env:PATH"`;
  const psMarker = "# fheenv";

  // PowerShell profiles (Windows PowerShell 5 and PowerShell 7)
  const psProfiles = [
    path.join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
    path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
  ];

  for (const prof of psProfiles) {
    try {
      fs.mkdirSync(path.dirname(prof), { recursive: true });
      const existing = fs.existsSync(prof) ? fs.readFileSync(prof, "utf8") : "";
      if (!existing.includes(installDir)) {
        fs.appendFileSync(prof, `\n${psMarker}\n${psLine}\n`);
      }
    } catch {
      /* non-fatal */
    }
  }

  // Git Bash / Git-for-Windows: ~ maps to %USERPROFILE%
  const bashLine = `export PATH="$HOME/.fheenv/bin:$PATH"`;
  const bashMarker = "# fheenv";
  const bashFiles = [path.join(home, ".bashrc"), path.join(home, ".bash_profile")];

  for (const f of bashFiles) {
    try {
      if (!fs.existsSync(f)) continue;
      const existing = fs.readFileSync(f, "utf8");
      if (!existing.includes(".fheenv/bin")) {
        fs.appendFileSync(f, `\n${bashMarker}\n${bashLine}\n`);
      }
    } catch {
      /* non-fatal */
    }
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
    spinner.succeed(chalk.green(`Already up to date — ${chalk.bold(latestTag)}`));
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
        `Could not replace binary: ${(err as Error).message}\n` + `  Try: sudo fheenv update`,
      ),
    );
    process.exit(1);
  }

  // On Windows, also patch PS profiles + Git Bash rc so VS Code terminals
  // pick up the PATH without needing a full VS Code restart.
  if (process.platform === "win32") {
    patchWindowsProfiles(path.dirname(process.execPath));
  }

  spinner.succeed(chalk.green(`✓ Updated to ${chalk.bold(latestTag)}!`));

  if (process.platform === "win32") {
    console.log(
      chalk.yellow(
        "\n⚠  If you're running inside VS Code, close and reopen VS Code\n" +
          "   to pick up the new binary (VS Code caches its environment at launch).\n" +
          "   New standalone PowerShell / cmd windows work immediately.",
      ),
    );
  } else {
    console.log(chalk.dim("  Open a new terminal to use the new version."));
  }
}
