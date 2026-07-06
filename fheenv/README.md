<div align="center">
  <img src="frontend/public/brand/logo-full.svg" alt="fheENV" width="380" />
  <br /><br />
  <a href="https://fheenv.vercel.app"><img src="https://img.shields.io/badge/Web%20App-fheenv.vercel.app-2DD4BF?style=flat-square&logo=vercel&logoColor=white" alt="Web App" /></a>
  <a href="https://fheenv.vercel.app/docs"><img src="https://img.shields.io/badge/Docs-fheenv.vercel.app/docs-0EA5E9?style=flat-square" alt="Docs" /></a>
  <a href="https://github.com/Team-Managed/fheENV/releases/latest"><img src="https://img.shields.io/github/v/release/Team-Managed/fheENV?style=flat-square&color=2DD4BF&label=CLI" alt="CLI Release" /></a>
</div>

---

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

## CLI — complete guide

### Installation

```bash
cd cli
pnpm install        # or npm install
pnpm run build      # compiles TypeScript → dist/
```

After building, the binary is at `dist/index.js`. You can run it as `node dist/index.js <command>` or link it globally:

```bash
npm link            # makes `fheenv` available globally
```

---

### Authentication

The CLI needs an Ethereum private key to sign transactions and decrypt FHE handles. There are two ways to provide it:

#### Option A — `fheenv login` (interactive / developer use)

```bash
node dist/index.js login --key 0xYOUR_PRIVATE_KEY
```

Saves the key to `~/.fheenv/wallet.json` with `chmod 600`. All subsequent commands read from there automatically. Only needed once per machine.

#### Option B — `FHEENV_PRIVATE_KEY` env var (CI/CD)

```bash
export FHEENV_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
node dist/index.js pull --env production
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
  "rpcUrl": "https://ethereum-sepolia-rpc.publicnode.com",
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
  --rpc https://ethereum-sepolia-rpc.publicnode.com \
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

Creates `.fheenv.json` in the current directory. Run once per project.

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
8. The AES key is now stored on-chain as two `euint128` ciphertexts — unreadable by anyone without your wallet's FHE permit

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

What happens step-by-step:

1. Reads `projectId` + `registryAddress` from `.fheenv.json`
2. Calls `getEnvironment()` on Sepolia to get the two `euint128` handles and IPFS CID
3. Connects to the Fhenix Threshold Network and decrypts both handles using your wallet's FHE permit → reconstructs the 32-byte AES key locally
4. Fetches the encrypted blob from IPFS
5. Decrypts the blob with the reconstructed AES key
6. Writes the plaintext to `.env.local` (permissions `0600`)

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

Same decryption flow as `pull`, but secrets are injected into `process.env` of the child process and never written to disk. The child process exits normally; no cleanup needed.

| Flag               | Default      | Description           |
| ------------------ | ------------ | --------------------- |
| `-e, --env <name>` | `production` | Environment to inject |

---

#### `fheenv team add`

Grant another wallet address the ability to decrypt a specific environment.

```bash
fheenv team add --member 0xTeammateAddress --env production
```

Calls `grantAccess(projectId, envName, memberAddress)` on Sepolia. After this, the teammate can run `fheenv pull` or `fheenv run` with their own wallet.

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

After rotation, any removed members' old FHE permits are worthless — the old ciphertext handles are orphaned and the new ones are only granted to current members.

| Flag                | Default      | Description                   |
| ------------------- | ------------ | ----------------------------- |
| `-e, --env <name>`  | `production` | Environment to rotate         |
| `-f, --file <path>` | `.env`       | Local .env file to re-encrypt |

---

### End-to-end workflow example

```bash
# ── Day 1: Setup ──────────────────────────────────────────────────────────────

# 1. Save your wallet (one-time per machine)
fheenv login --key 0xYOUR_PRIVATE_KEY

# 2. Initialize a project in your repo
cd my-app
fheenv init \
  --name "my-app" \
  --registry 0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2 \
  --rpc https://ethereum-sepolia-rpc.publicnode.com \
  --chain-id 11155111 \
  --pinata-jwt eyJ...

# 3. Push your secrets (assuming .env exists)
fheenv push --env production
# → Encrypts locally, uploads blob to IPFS, stores AES key as FHE ciphertext on Sepolia

# ── Day 2: Onboard a teammate ─────────────────────────────────────────────────

fheenv team add --member 0xTeammate --env production
# → Teammate can now run `fheenv pull` with their own wallet

# ── Day 3: Use in dev ─────────────────────────────────────────────────────────

# Option A: write decrypted secrets to .env.local
fheenv pull --env production

# Option B: inject into process without touching disk (recommended)
fheenv run --env production -- node index.js

# ── Day 4: Someone leaves the team ────────────────────────────────────────────

fheenv team remove --member 0xFormerTeammate --env production
# ⚠️  CLI warns: rotation required

fheenv rotate --env production
# → New AES key, new IPFS blob, new FHE handles. Former teammate's old permit is worthless.

# ── CI/CD: no keyfile, no MetaMask ────────────────────────────────────────────

# In your CI pipeline (GitHub Actions, etc.):
FHEENV_PRIVATE_KEY=${{ secrets.DEPLOY_KEY }} fheenv pull --env production
FHEENV_PRIVATE_KEY=${{ secrets.DEPLOY_KEY }} fheenv run --env production -- npm start
```

---

## Web Dashboard

```bash
cd frontend
pnpm install
cp ../.env.example .env.local   # fill in NEXT_PUBLIC_REGISTRY_ADDRESS etc.
pnpm dev
```

Open `http://localhost:3000`. Connect MetaMask → create project → push secrets → manage team.

---

## Smart Contract

```bash
# Run tests (34 tests, all edge cases covered)
pnpm test

# Deploy to Sepolia (already deployed — only needed for a fresh deployment)
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## Environment variables

Copy `.env.example` to `.env`:

| Variable                       | Used by                 | Description                       |
| ------------------------------ | ----------------------- | --------------------------------- |
| `SEPOLIA_RPC_URL`              | Hardhat deploy          | Infura / Alchemy Sepolia endpoint |
| `PRIVATE_KEY`                  | Hardhat deploy          | Deployer wallet private key       |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | Frontend                | Deployed contract address         |
| `NEXT_PUBLIC_CHAIN_ID`         | Frontend                | `11155111` (Sepolia)              |
| `NEXT_PUBLIC_SEPOLIA_RPC`      | Frontend                | Sepolia RPC endpoint              |
| `PINATA_JWT`                   | Frontend (server) + CLI | Pinata JWT for IPFS uploads       |

---

## Security model

| What's stored               | Where              | Readable by anyone?              |
| --------------------------- | ------------------ | -------------------------------- |
| 2× euint128 AES key handles | Sepolia (on-chain) | ❌ FHE ciphertext                |
| Encrypted `.env` blob       | IPFS               | ❌ Gibberish without AES key     |
| Plaintext secrets           | Your device only   | ✅ Only you                      |
| IPFS CID                    | Sepolia (on-chain) | ✅ Just a pointer, useless alone |

**Revocation:** CoFHE's ACL is append-only — there is no `revokeAllow`. Cryptographic access is cut by key rotation: `fheenv rotate` issues new ciphertext handles that the removed member never receives `FHE.allow` on. The old handles become orphans on IPFS.

---

## Tech stack

| Layer                | Technology                                                      |
| -------------------- | --------------------------------------------------------------- |
| Smart contract       | Solidity 0.8.25 + `@fhenixprotocol/cofhe-contracts`             |
| FHE                  | Fhenix CoFHE (Threshold Network, `euint128`)                    |
| Contract testing     | Hardhat 2 + `@cofhe/hardhat-plugin` (34 tests)                  |
| Frontend             | Next.js 14 (App Router) + wagmi v2 + viem                       |
| FHE client (browser) | `@cofhe/sdk/web`                                                |
| FHE client (CLI)     | `@cofhe/sdk/node`                                               |
| Encryption           | AES-256-GCM — Web Crypto API (browser) / Node.js `crypto` (CLI) |
| IPFS                 | Pinata                                                          |
| Package manager      | pnpm 11 (workspace)                                             |
