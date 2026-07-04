# fheENV — Pitch Deck

## FHE BUIDL Mumbai · Analytics Track

---

## SLIDE 1 — Title

```
fheENV
─────────────────────────────────────────────────────
Your .env, encrypted. Not even us.

Decentralized secrets management powered by
Fully Homomorphic Encryption on Fhenix.

Track: Analytics
Team: [Your Team Name]
```

---

## SLIDE 2 — The Problem (Make it Personal)

### Every developer has done this 👇

```
Priya on Slack:   "hey can you share the prod DB password?"

Rohan:            "sure one sec"
                  → DATABASE_URL=postgres://prod:s3cr3t@db.app.in/myapp
                  → OPENAI_KEY=sk-proj-abc123...
                  → STRIPE_SECRET=sk_live_xyz...

                  ✓ Message sent

That message now lives:
  • On Slack's servers (forever)
  • In Slack's backups
  • In Priya's notification history
  • In Rohan's sent messages
  • Available to any Slack employee or hacker
```

---

## SLIDE 3 — The Problem Runs Deeper

### Existing tools don't actually solve it

| Tool                       | What they claim                  | Reality                                                               |
| -------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| **Doppler**                | "Centralized secrets management" | Doppler's servers hold your secrets in plaintext. Breach = game over. |
| **HashiCorp Vault**        | "Secrets as a service"           | Vault admin has full access. Insider threat is real.                  |
| **AWS Secrets Manager**    | "Secure secret storage"          | US government subpoena → your production keys disclosed.              |
| **Sharing on Slack/Email** | Quick and easy                   | Audit trail? Zero. Revocation? Impossible.                            |

### The numbers

- **2024:** Change Healthcare breach — 192 million patient records exposed via compromised credentials
- **2025:** 642+ credential-related breaches affecting enterprise systems
- **Root cause in 80% of breaches:** stolen or mismanaged secrets

> **The core problem: Every solution requires you to trust a company with your production secrets. That trust is a liability.**

---

## SLIDE 4 — The Solution: fheENV

### Zero-trust secrets management. Cryptographically, not contractually.

```
                        TODAY (Doppler/Vault)
────────────────────────────────────────────────────────────
Developer → Encrypt → [Doppler Server] → Decrypt → Team
                            ↑
                   Doppler can see everything
                   Hackers can steal everything
                   Government can subpoena everything


                        fheENV (FHE)
────────────────────────────────────────────────────────────
Developer → FHE Encrypt → [Fhenix Blockchain] → FHE Decrypt → Team
                                  ↑
                    No server holds your plaintext
                    Mathematically impossible to read
                    Even Fhenix nodes cannot see your secrets
```

### The guarantee

> "Your AES key is stored as an FHE ciphertext. The platform operator is **cryptographically incapable** of reading it — not policy-prevented, not trust-based. **Mathematically impossible.**"

---

## SLIDE 5 — How It Works (Technical)

### The AES + FHE Envelope Architecture

```
PUSH (Developer)                     PULL (Teammate)
────────────────                     ───────────────

.env file                            Connect wallet
    ↓                                    ↓
Generate AES-256 key                 Fetch IPFS CID from chain
(random, never stored)                   ↓
    ↓                                Decrypt 2x euint128 AES key
AES-GCM encrypt full .env            via Threshold Network
    ↓                                (only authorized wallets can)
Upload encrypted blob → IPFS             ↓
    ↓                                Reassemble AES-256 key locally
Split AES key → 2x euint128              ↓
Encrypt with FHE → on-chain handles  AES-decrypt blob locally
    ↓                                    ↓
Grant FHE permits to teammates       Plaintext .env on their device
```

### What lives where

| Location           | Data                        | Readable by anyone?          |
| ------------------ | --------------------------- | ---------------------------- |
| Ethereum / Sepolia | 2x euint128 AES key handles | ❌ FHE ciphertext            |
| IPFS               | AES-encrypted .env blob     | ❌ Gibberish without AES key |
| Your device        | Plaintext secrets           | ✅ Only you                  |
| Fhenix nodes       | FHE computation             | ❌ Encrypted throughout      |

---

## SLIDE 6 — Fhenix FHE Use Case

### Why FHE is the only solution

**The challenge:** We need to store a secret (AES key) such that:

1. Only authorized wallet addresses can decrypt it
2. Nobody in the middle — platform, nodes, blockchain — can see it
3. Access can be cryptographically revoked

**Why ZK proofs don't work here:** ZK can prove "I know X" but cannot _compute on_ or _selectively reveal_ encrypted data to different parties.

**Why regular encryption doesn't work:** AES/RSA requires a trusted key custodian — someone has to hold the decryption key, and that someone is your attack surface.

**Why FHE works:**

```solidity
// Store AES-256 key as two FHE-encrypted uint128 values
euint128 aesKeyHigh = FHE.asEuint128(inKeyHigh); // ZKPoK verified
euint128 aesKeyLow  = FHE.asEuint128(inKeyLow);

// Grant decrypt permission to a teammate's wallet
FHE.allow(aesKeyHigh, teammateAddress);
FHE.allow(aesKeyLow,  teammateAddress);

// Revoke access: mark inactive in contract state, then ROTATE
// CoFHE's ACL is append-only — cryptographic cutoff happens when
// updateEnvironment() issues new ciphertext handles that the
// removed member never receives FHE.allow on.
revokeAccess(projectId, envName, formerTeammateAddress); // marks inactive
updateEnvironment(projectId, envName, newKeyHigh, newKeyLow, newCid, v); // new handles
```

**The Threshold Network** (Fhenix's distributed MPC) holds key shares across multiple nodes. No single node can decrypt. The key is only reconstructed on the authorized user's device.

### FHE operations used

| Operation                                                   | Purpose                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `FHE.asEuint128(InEuint128)`                                | Store encrypted AES key chunk on-chain                     |
| `FHE.allow(handle, address)`                                | Grant decrypt access to a team member                      |
| `FHE.allowThis(handle)`                                     | Contract retains ability to re-grant on rotation           |
| `client.decryptForView(handle, FheTypes.Uint128).execute()` | Member decrypts AES key locally                            |
| Key rotation via `updateEnvironment()`                      | Cryptographic revocation — new handles, old ones abandoned |

---

## SLIDE 7 — Implementation: What We Built

### Three components, fully working

```
┌─────────────────────────────────────────────────────────┐
│  1. Smart Contract — fheENVRegistry.sol (Solidity)      │
│  ─────────────────────────────────────────────────────  │
│  • createProject / addOwner (multi-owner support)        │
│  • updateEnvironment (FHE AES key + IPFS CID)           │
│  • grantAccess / batchGrantAccess / revokeAccess        │
│  • Optimistic locking (concurrent rotation guard)        │
│  • Case-insensitive env names via keccak256 hash         │
│  Deployed: Sepolia 0x...                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  2. Web Dashboard — Next.js + wagmi + @cofhe/sdk        │
│  ─────────────────────────────────────────────────────  │
│  • Project + environment management                      │
│  • Push secrets: encrypt in browser, upload to IPFS     │
│  • Pull secrets: decrypt AES key via FHE, view in-app   │
│  • Team management: grant / batch grant / revoke        │
│  • On-chain audit log                                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  3. CLI — fheenv (Node.js, npm installable)             │
│  ─────────────────────────────────────────────────────  │
│  fheenv push --env production     # encrypt + upload    │
│  fheenv pull --env production     # decrypt + write     │
│  fheenv run --env production -- node app.js             │
│  fheenv team-add 0x... --env prod # grant access        │
│  FHEENV_PRIVATE_KEY=0x... fheenv pull  # CI/CD support  │
└─────────────────────────────────────────────────────────┘
```

---

## SLIDE 8 — Live Demo Flow

### What the judges will see

```
STEP 1 — Push secrets (Wallet A / Owner)
─────────────────────────────────────────
Open fheENV dashboard → Create project "demo-app"
Paste .env:
    DATABASE_URL=postgres://prod:secret@db.example.com/myapp
    OPENAI_KEY=sk-proj-realkey123
    JWT_SECRET=supersecretjwt

Click "Encrypt & Push" →

  Browser generates AES-256 key (never leaves device)
  Encrypts .env with AES-GCM
  Uploads encrypted blob to IPFS
  Splits AES key → 2x euint128
  FHE encrypts both halves
  Transaction submitted

Open Etherscan → inspect calldata
→ Zero readable secrets. Just encrypted bytes.


STEP 2 — Grant access (Wallet A)
──────────────────────────────────
Team manager → paste Wallet B address → Grant Access
→ One tx: FHE.allow() for both AES key halves


STEP 3 — Pull secrets (Wallet B / Teammate)
─────────────────────────────────────────────
Switch to Wallet B in MetaMask
Click "Decrypt Secrets" →

  Threshold Network decrypts 2x euint128 to Wallet B
  Browser reconstructs AES-256 key
  Fetches IPFS blob → decrypts locally
  Secrets appear in table ✅



```

---

## SLIDE 9 — Why Analytics Track

### fheENV is encrypted data management infrastructure

The Analytics track: _"Autonomous systems operating on encrypted information while maintaining security and user privacy"_

| Analytics Track Criteria         | fheENV                                                    |
| -------------------------------- | --------------------------------------------------------- |
| Encrypted information operations | AES-256 + FHE — secrets are never plaintext on any server |
| Autonomous systems               | CI/CD pipelines pull secrets autonomously via CLI         |
| Security & user privacy          | Cryptographic access control, on-chain audit trail        |
| Real-world data problem          | 80% of breaches start with compromised credentials        |

### The broader vision

fheENV is the **secrets layer for the encrypted web** — the foundational infrastructure that lets any application (AI agents, DeFi protocols, analytics platforms) manage credentials without a centralized trust point.

---

## SLIDE 10 — Market & Impact

### Why this matters now

```
$2.3B          secrets management market size (2025)
$8.9B          projected by 2030 (18% CAGR)

Doppler        raised $20M Series A
HashiCorp      acquired by IBM for $6.4B
AWS Secrets    charging $0.40/secret/month

All of them    require trusting a centralized server
None of them   are mathematically private
```

### India-specific opportunity

- 5M+ software developers in India
- DPDP Act 2023 — new data protection regulations require demonstrable security
- Growing startup ecosystem — early-stage teams can't afford enterprise Vault licenses
- fheENV: **free infrastructure, no subscription, your secrets never leave your wallet**

---

## SLIDE 11 — Judging Criteria Alignment

| Criteria                       | Max    | fheENV                                                                                                                                                                                          |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem Statement**          | 10     | Universally experienced by every developer. Backed by breach statistics. Clear villain (centralized trust).                                                                                     |
| **Fhenix-Compatible Use Case** | 10     | FHE is architecturally irreplaceable — `euint128` for AES key storage, `FHE.allow` for access grants, rotation-enforced revocation, Threshold Network for decryption. No other primitive works. |
| **MVP / Demo Video**           | 10     | Full working demo: push encrypted secrets, share with teammate, verify Etherscan shows zero plaintext.                                                                                          |
| **E2E Deployment**             | 5      | `fheENVRegistry.sol` deployed on Sepolia. Web app live. CLI installable via npm.                                                                                                                |
| **Total**                      | **35** | **35**                                                                                                                                                                                          |

---

## SLIDE 12 — Team & Closing

```
fheENV
─────────────────────────────────────────────────────────

"The Doppler alternative where not even we can see your secrets"

Built with:
  • Fhenix CoFHE — FHE-encrypted AES key storage
  • @cofhe/sdk — client-side encrypt/decrypt
  • Solidity + Hardhat — smart contract + tests
  • Next.js + wagmi — web dashboard
  • Node.js CLI — developer tooling
  • IPFS / Pinata — encrypted blob storage

GitHub: [repo link]
Demo: [deployed URL]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"What Doppler charges you $50/month to promise,
 fheENV guarantees mathematically — for free."
```

---

## SPEAKER NOTES

### Slide 2 (Problem) — delivery tip

Start with the Slack story. Say "everyone in this room has done this in the last week." Pause. Let them nod. Then hit them with the Doppler/Vault slide showing that even the "proper" solutions have the same fundamental problem.

### Slide 5 (How it works) — delivery tip

Don't rush through the architecture. The key message is: **two things on-chain (FHE handles), one thing on IPFS (encrypted blob), plaintext only on your device**. Draw it out verbally.

### Slide 8 (Demo) — delivery tip

This is your winning moment. Open Etherscan after pushing. Find the transaction. Show the calldata — it's unreadable bytes. Then switch wallets and decrypt in real time. The judges will see the magic.

### Closing line

> "Every developer in this room has a secret on Slack right now. fheENV means that never has to happen again."
