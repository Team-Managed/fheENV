# fheENV

> **Your .env, encrypted. Not even us.**

Zero-trust secrets management powered by Fully Homomorphic Encryption on Fhenix.  
Secrets are AES-256 encrypted on your device. The AES key is stored on-chain as two FHE ciphertexts — the server (or anyone else) is **mathematically** incapable of reading them.

---

## How it works

```
Your .env file
      │
      ▼ AES-256-GCM  (random key, generated locally, never transmitted)
Encrypted blob ──────────────► IPFS  (gibberish without the key)
      │
AES key (32 bytes)
      │ split into two 16-byte halves
      ▼ FHE.asEuint128 × 2  (Fhenix CoFHE)
On-chain handles ────────────► Sepolia  (encrypted — even node operators can't read)
```

**To decrypt:**  
Threshold Network decrypts your two `euint128` handles locally → reassemble 32-byte AES key → fetch IPFS blob → decrypt locally. Plaintext never leaves your machine.

---

## Deployed contract

|               |                                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| **Network**   | Ethereum Sepolia (chain ID `11155111`)                                          |
| **Address**   | `0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2`                                    |
| **Etherscan** | https://sepolia.etherscan.io/address/0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2 |

---

## Installation

### Option A — One-line install (recommended)

The install script downloads the correct binary for your platform, places it in the right directory, and configures your shell's PATH automatically.

#### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash
```

The script:

1. Detects your OS and CPU architecture
2. Downloads the latest `fheenv` binary from the [GitHub Releases](https://github.com/Team-Managed/fheENV/releases/latest) page
3. Installs the binary to `~/.fheenv/bin/`
4. Appends the following to `~/.bashrc`, `~/.zshrc`, and `~/.bash_profile` (whichever exist):

```bash
# fheenv
export PATH="$HOME/.fheenv/bin:$PATH"
```

After installation, either open a new terminal or run:

```bash
source ~/.bashrc   # bash users
source ~/.zshrc    # zsh users (default on macOS)
```

Verify:

```bash
fheenv --version
```

#### Windows (PowerShell)

Run PowerShell as Administrator and execute:

```powershell
irm https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.ps1 | iex
```

The script:

1. Downloads the latest `fheenv-windows.exe` from the [GitHub Releases](https://github.com/Team-Managed/fheENV/releases/latest) page
2. Installs the binary to `%USERPROFILE%\.fheenv\bin\fheenv.exe`
3. Permanently adds `%USERPROFILE%\.fheenv\bin` to your **User PATH** (no admin rights needed for PATH update)

Open a **new** terminal and verify:

```powershell
fheenv --version
```

---

### Option B — Manual download

1. Go to the [latest release](https://github.com/Team-Managed/fheENV/releases/latest)
2. Download the binary for your platform:

   | Platform                      | File                 |
   | ----------------------------- | -------------------- |
   | macOS (Intel + Apple Silicon) | `fheenv-macos`       |
   | Linux x64                     | `fheenv-linux`       |
   | Windows x64                   | `fheenv-windows.exe` |

3. Make it executable and move it to a directory on your PATH:

**macOS / Linux:**

```bash
chmod +x fheenv-macos          # or fheenv-linux
mkdir -p ~/.fheenv/bin
mv fheenv-macos ~/.fheenv/bin/fheenv

# Add to PATH — add this line to your ~/.zshrc or ~/.bashrc
echo 'export PATH="$HOME/.fheenv/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Windows (PowerShell):**

```powershell
$dir = "$env:USERPROFILE\.fheenv\bin"
New-Item -ItemType Directory -Force -Path $dir
Move-Item fheenv-windows.exe "$dir\fheenv.exe"

# Add to User PATH permanently
$current = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($current -notlike "*$dir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$current;$dir", "User")
}
# Refresh current session
$env:PATH = "$env:PATH;$dir"
```

---

### Option C — Build from source

```bash
git clone https://github.com/Team-Managed/fheENV.git
cd fheENV/fheenv/cli
pnpm install        # or npm install
pnpm run build      # compiles TypeScript → dist/
npm link            # makes `fheenv` available globally
```

---

## CLI — complete guide

### Authentication

The CLI needs an Ethereum private key to sign transactions and decrypt FHE handles. There are two ways to provide it:

#### Option A — `fheenv login` (interactive / developer use)

```bash
fheenv login --key 0xYOUR_PRIVATE_KEY
```

Saves the key to `~/.fheenv/wallet.json` with `chmod 600`. All subsequent commands read from there automatically. Only needed once per machine.

#### Option B — `FHEENV_PRIVATE_KEY` env var (CI/CD)

```bash
export FHEENV_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
fheenv pull --env production
```

The env var takes priority over the keyfile. Use a scoped read-only wallet for CI pipelines.

> **Never commit your private key.** The `.fheenv.json` project config (committed) contains no secrets — only the registry address, RPC URL, and project ID.

---

### Project config — `.fheenv.json`

Every command (except `login`) reads this file from the current directory. `fheenv init` creates it.

```json
{
  "projectId": 0,
  "registryAddress": "0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2",
  "rpcUrl": "https://sepolia.infura.io/v3/YOUR_KEY",
  "chainId": 11155111,
  "pinataJwt": "eyJhbGc..."
}
```

Commit this file to your repo. It contains no secrets.

---

### Commands

#### `fheenv login`

Save a private key to the local keyfile.

```bash
fheenv login --key 0xABC123...
```

| Flag                     | Description                         |
| ------------------------ | ----------------------------------- |
| `-k, --key <privateKey>` | 0x-prefixed 64-hex-char private key |

Stores at `~/.fheenv/wallet.json` (permissions `0600`).

---

#### `fheenv init`

Create a new project on-chain and write `.fheenv.json` to the current directory.

```bash
fheenv init \
  --name "my-app" \
  --registry 0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2 \
  --rpc https://sepolia.infura.io/v3/YOUR_KEY \
  --chain-id 11155111 \
  --pinata-jwt eyJhbGc...
```

| Flag                       | Default  | Description                     |
| -------------------------- | -------- | ------------------------------- |
| `-n, --name <name>`        | required | Project name (1–64 chars)       |
| `-r, --registry <address>` | required | fheENVRegistry contract address |
| `--rpc <url>`              | required | Sepolia RPC endpoint            |
| `--chain-id <id>`          | required | `11155111` for Sepolia          |
| `--pinata-jwt <jwt>`       | required | Pinata JWT for IPFS uploads     |

---

#### `fheenv push`

Encrypt your local `.env` file and push it to fheENV.

```bash
fheenv push
fheenv push --env staging --file .env.staging
```

What happens step-by-step:

1. Reads your `.env` file from disk
2. Generates a fresh random 256-bit AES key
3. Encrypts the entire `.env` content with AES-256-GCM (output: encrypted blob)
4. Uploads the encrypted blob to IPFS via Pinata — gets back a CID
5. Splits the AES key into two 128-bit halves
6. FHE-encrypts both halves via the Fhenix Threshold Network (ZK proof generated locally)
7. Submits `updateEnvironment(projectId, envName, encHigh, encLow, cid, version)` to Sepolia

| Flag                | Default      | Description           |
| ------------------- | ------------ | --------------------- |
| `-e, --env <name>`  | `production` | Environment name      |
| `-f, --file <path>` | `.env`       | Local file to encrypt |

---

#### `fheenv pull`

Decrypt secrets from fheENV and write them to a local file.

```bash
fheenv pull
fheenv pull --env staging --output .env.staging.local
```

| Flag                  | Default      | Description         |
| --------------------- | ------------ | ------------------- |
| `-e, --env <name>`    | `production` | Environment to pull |
| `-o, --output <path>` | `.env.local` | Output file path    |

---

#### `fheenv run`

Decrypt secrets and inject them directly into a child process — **nothing written to disk**.

```bash
fheenv run -- node server.js
fheenv run --env staging -- npm start
fheenv run --env production -- python manage.py runserver
```

| Flag               | Default      | Description           |
| ------------------ | ------------ | --------------------- |
| `-e, --env <name>` | `production` | Environment to inject |

---

#### `fheenv team add`

Grant another wallet address the ability to decrypt a specific environment.

```bash
fheenv team add --member 0xTeammateAddress --env production
```

| Flag                     | Default      | Description                      |
| ------------------------ | ------------ | -------------------------------- |
| `-m, --member <address>` | required     | Ethereum address to grant access |
| `-e, --env <name>`       | `production` | Environment to grant access to   |

---

#### `fheenv team remove`

Revoke a teammate's access.

```bash
fheenv team remove --member 0xTeammateAddress --env production
```

> ⚠️ **KEY ROTATION REQUIRED.** The contract marks the member inactive, but because CoFHE's ACL is append-only there is no `revokeAllow` primitive. The removed member retains cryptographic access to the current ciphertexts until you run `fheenv rotate`. The CLI prints a prominent warning and tells you exactly what to do.

| Flag                     | Default      | Description                |
| ------------------------ | ------------ | -------------------------- |
| `-m, --member <address>` | required     | Ethereum address to revoke |
| `-e, --env <name>`       | `production` | Environment                |

---

#### `fheenv rotate`

Re-encrypt the environment with a brand new AES key and re-grant access to all current members.

```bash
fheenv rotate
fheenv rotate --env staging
```

What happens step-by-step:

1. Reads the current environment version from chain (optimistic lock)
2. Scans all `AccessGranted` / `AccessRevoked` chain events to build the current active member list
3. Generates a fresh AES-256 key
4. Re-encrypts your local `.env` file with the new key
5. Uploads the new encrypted blob to IPFS
6. FHE-encrypts the new key halves and submits to chain — old ciphertext handles are abandoned
7. Calls `batchGrantAccess` to re-issue FHE permits to all active members on the new handles

After rotation, any removed members' old FHE permits are worthless.

| Flag                | Default      | Description                   |
| ------------------- | ------------ | ----------------------------- |
| `-e, --env <name>`  | `production` | Environment to rotate         |
| `-f, --file <path>` | `.env`       | Local .env file to re-encrypt |

---

### End-to-end workflow example

```bash
# ── Day 1: Setup ──────────────────────────────────────────────────────────────

# 1. Install fheenv (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.sh | bash
source ~/.zshrc

# 2. Save your wallet (one-time per machine)
fheenv login --key 0xYOUR_PRIVATE_KEY

# 3. Initialize a project in your repo
cd my-app
fheenv init \
  --name "my-app" \
  --registry 0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2 \
  --rpc https://sepolia.infura.io/v3/YOUR_KEY \
  --chain-id 11155111 \
  --pinata-jwt eyJ...

# 4. Push your secrets (assuming .env exists)
fheenv push --env production

# ── Day 2: Onboard a teammate ─────────────────────────────────────────────────

fheenv team add --member 0xTeammate --env production

# ── Day 3: Use in dev ─────────────────────────────────────────────────────────

# Option A: write decrypted secrets to .env.local
fheenv pull --env production

# Option B: inject into process without touching disk (recommended)
fheenv run --env production -- node index.js

# ── Day 4: Someone leaves the team ────────────────────────────────────────────

fheenv team remove --member 0xFormerTeammate --env production
# ⚠️  CLI warns: rotation required

fheenv rotate --env production

# ── CI/CD: no keyfile, no MetaMask ────────────────────────────────────────────

# In your GitHub Actions workflow:
FHEENV_PRIVATE_KEY=${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start
```
