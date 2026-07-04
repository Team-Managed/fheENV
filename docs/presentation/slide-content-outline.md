# fheENV — Hackathon Idea Pitch: Slide Content Outline

**Purpose:** Initial idea selection round. Goal = get selected. Keep it tight.
**Format:** 6 slides. No code deep-dives. No full demo. Just the idea, why it matters, why FHE.
**Track:** Analytics
**Time:** ~3–4 minutes verbal

---

## SLIDE 1 — Cover

**Layout:** Centered, full-screen hero

**Content:**

- Logo mark: `fhe` (indigo) + `ENV` (white) in monospace
- Tagline: `Your .env, encrypted. Not even us.`
- Sub-label: `FHE BUIDL Mumbai · Analytics Track · 2026`
- Bottom: team name placeholder

**Tone:** Confident, minimal, technical
**Visual:** Dark background with a very subtle animated terminal cursor after the tagline

---

## SLIDE 2 — The Problem (Make it feel personal)

**Headline:** `"You've done this. Today."`

**Content:**

- Fake Slack-style message bubble (animated, types itself out):

  ```
  Priya → #dev-team
  "hey can you send the prod DB password?"

  Rohan → #dev-team
  DATABASE_URL=postgres://prod:s3cr3t@db.app/myapp
  OPENAI_KEY=sk-proj-abc123...
  ```

- Below it, in red: `Now it lives on Slack's servers. Forever.`
- One stat, large: `80% of data breaches start with a stolen credential`

**Tone:** Confrontational. Judges should feel this personally.
**Visual:** Message bubbles with a red "LEAKED" badge overlay that fades in

---

## SLIDE 3 — Existing Tools Don't Fix It

**Headline:** `"Doppler, Vault, AWS — same problem, different server"`

**Content:**
Three side-by-side cards:
| Doppler | HashiCorp Vault | AWS Secrets Manager |
|---|---|---|
| "Centralized secrets" | "Secrets as service" | "Secure storage" |
| Doppler reads your keys | Admin has full access | US gov can subpoena |
| Trust-based | Trust-based | Trust-based |

- Common label across all three: `REQUIRES TRUSTING A COMPANY`
- Below: `That trust is your attack surface.`

**Tone:** Calm, factual, damning
**Visual:** Three cards with a warning badge. Bottom row glows red on "REQUIRES TRUSTING A COMPANY"

---

## SLIDE 4 — The Solution: fheENV

**Headline:** `"Zero-trust secrets. Mathematically, not contractually."`

**Content:**
Two-column visual:

LEFT (Today):

```
Your .env
   ↓
Doppler server  ← reads everything
   ↓
Your team
```

Label: `"Trust us" model`

RIGHT (fheENV):

```
Your .env
   ↓
AES-256 encrypt (your device)
   ↓
IPFS blob  ← gibberish to everyone
AES key → FHE encrypt → on-chain
   ↓
Team decrypts with their wallet
```

Label: `"Math" model`

- One line at bottom: `The platform is cryptographically incapable of reading your secrets — not policy-prevented. Mathematically impossible.`

**Tone:** Clear, powerful, factual
**Visual:** Two columns with arrows. Right side has green glows. Left side has red lock icon.

---

## SLIDE 5 — Why FHE? Why Fhenix?

**Headline:** `"Only FHE makes this possible"`

**Content:**
Three rows explaining why alternatives fail:

| Approach                      | Why it fails                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Regular encryption (AES only) | Someone must hold the decryption key → new single point of failure                    |
| Zero-Knowledge Proofs         | Can prove "I know X" — cannot selectively share encrypted data with different parties |
| Trusted Hardware (TEE)        | Still trusts a server/chip — hardware vulnerabilities exist                           |
| **FHE (Fhenix)**              | AES key stored as `euint128` — Threshold Network decrypts only to authorized wallets  |

- Highlight the FHE row in indigo
- One code snippet (small):
  ```solidity
  FHE.allow(aesKeyHandle, teammateAddress); // cryptographic grant
  FHE.revokeAllow(aesKeyHandle, formerMember); // cryptographic revoke
  ```

**Tone:** Technical credibility. Shows FHE knowledge.
**Visual:** Comparison table with checkmarks/crosses. Fhenix row highlighted.

---

## SLIDE 6 — What We'll Build

**Headline:** `"Three components. One working demo."`

**Content:**
Three cards in a row:

**Smart Contract**
`fheENVRegistry.sol`

- Store AES-256 key as 2× `euint128`
- Grant / revoke / batch access
- Optimistic rotation locking
- Deploy: Sepolia testnet

**Web Dashboard**
`Next.js + @cofhe/sdk`

- Create projects + environments
- Push secrets (encrypt in browser)
- Decrypt secrets (in browser only)
- Team access management

**CLI Tool**
`fheenv` (npm)

- `fheenv push --env production`
- `fheenv pull --env production`
- `fheenv run -- node app.js`
- CI/CD ready (`FHEENV_PRIVATE_KEY`)


**Tone:** Confidence. Specific. Shows it's real.
**Visual:** Three feature cards with icons. Bottom demo callout in a highlighted box.

---

## Design Notes

**Palette:**

- Background: `#080B14` (near-black navy)
- Surface: `#0F1629`
- Primary accent: `#6366F1` (indigo — Fhenix brand)
- Success/encrypted: `#22C55E` (green)
- Danger/exposed: `#EF4444` (red)
- Text: `#F1F5F9`
- Muted: `#94A3B8`

**Typography:**

- Display: Space Grotesk (700 weight)
- Code/mono: JetBrains Mono
- Body: Space Grotesk 400

**Signature element:** Slide 2 — the Slack message that types itself and then gets the "LEAKED" overlay. This is the one moment judges will remember.

**Navigation:** Keyboard arrows + click. Dot indicator bottom center. Slide counter top right.
