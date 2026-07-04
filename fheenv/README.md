# fheENV

**Your .env, encrypted. Not even us.**

Zero-trust secrets management powered by Fully Homomorphic Encryption on Fhenix.
AES-256 keys stored as FHE ciphertexts on-chain — the platform operator is mathematically incapable of reading your secrets.

## Architecture

```
.env file → AES-256-GCM encrypt → IPFS blob
AES key → split into 2x euint128 → FHE encrypt → on-chain handles
```

To decrypt: FHE decrypt (Threshold Network) → reconstruct AES key → decrypt IPFS blob

## Quick Start

### Web Dashboard

1. Install dependencies: `cd frontend && npm install`
2. Copy `.env.example` to `.env` and fill in values
3. Run: `cd frontend && npm run dev`

### CLI

```bash
# Install
cd cli && npm install && npm run build

# Login
node dist/index.js login

# Initialize a project (deploy to Sepolia first)
node dist/index.js init --name my-app --registry <CONTRACT_ADDRESS>

# Push secrets
node dist/index.js push --env production

# Pull secrets
node dist/index.js pull --env production

# CI/CD (no MetaMask)
FHEENV_PRIVATE_KEY=0x... node dist/index.js pull --env production
```

### Contracts

```bash
cd fheenv   # root with hardhat
npm install
npm test    # 14 tests, all passing
npx hardhat run scripts/deploy.ts --network sepolia
```

## Tech Stack

- **Solidity 0.8.25** + `@fhenixprotocol/cofhe-contracts`
- **Hardhat 2** + `@cofhe/hardhat-plugin`
- **Next.js 14** (App Router) + wagmi v2 + viem
- **@cofhe/sdk** — browser and Node.js FHE client
- **AES-256-GCM** — Web Crypto API (browser) + Node.js `crypto`
- **IPFS via Pinata** — encrypted blob storage

## Security Model

| What's on-chain             | Readable?                    |
| --------------------------- | ---------------------------- |
| 2x euint128 AES key handles | ❌ FHE ciphertext            |
| IPFS CID of encrypted blob  | ✅ (just a pointer)          |
| IPFS blob content           | ❌ Gibberish without AES key |
| Plaintext secrets           | Never leaves your device     |

**Revocation note:** CoFHE's ACL is append-only. `revokeAccess` removes the member
from the on-chain list but cryptographic access persists until key rotation
(`fheenv rotate`).
