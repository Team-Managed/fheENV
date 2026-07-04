# fheENV Design Spec

**Tagline:** Your .env, encrypted. Not even us.

**Problem:** Every secrets management tool today (Doppler, Vault, AWS Secrets Manager) requires trusting a company with your production credentials. FHE eliminates that requirement mathematically — secrets are encrypted before leaving your device and the platform operator is cryptographically incapable of reading them.

---

## Architecture

### Encryption Model (AES-256 + FHE envelope)

```
.env file (plaintext)
       ↓
AES-256-GCM encryption (client-side, random key each rotation)
       ↓
Encrypted blob → uploaded to IPFS (pinned via Pinata)
AES key (32 bytes) → split into 2x euint128 → stored on-chain as FHE handles
       ↓
To decrypt: fetch blob from IPFS + decrypt FHE handles → reconstruct AES key → decrypt blob
```

One AES encryption per environment per rotation. One FHE operation (decrypt 2x euint128) to access all secrets. No per-secret FHE calls.

### Access Control

- FHE permits are per environment, not per secret
- `FHE.allow(aesKeyHigh, member)` + `FHE.allow(aesKeyLow, member)` = full env access
- **Revocation model:** CoFHE does not expose a `revokeAllow` function. The ACL mapping is append-only from Solidity. Revocation is enforced by **mandatory key rotation**: when a member is removed, the contract marks them as inactive in the `members` mapping and emits an `AccessRevoked` event, but cryptographic access is only cut off when the owner rotates the environment (new AES key → new FHE handles → only re-granted members receive `FHE.allow`). The CLI enforces this: `fheenv team remove` automatically triggers `fheenv rotate`.
- **Revocation policy:** rotation is mandatory on member removal, not optional

### On-chain Data (public, non-sensitive)

```
Project:     id, name, owners[], createdAt
Environment: projectId, name (hashed), blobCid (IPFS), version, updatedAt
Members:     projectId, envName, address, role (owner/admin/reader)
```

### Off-chain Data

```
IPFS:        AES-GCM encrypted .env blob (gibberish without AES key)
~/.fheenv/:  local cache of last-decrypted encrypted blobs (for offline use)
```

---

## Smart Contract

Single `fheENVRegistry.sol` — one deployment, all projects namespaced by ID.

```solidity
struct Environment {
    euint128 aesKeyHigh;  // upper 16 bytes of AES-256 key
    euint128 aesKeyLow;   // lower 16 bytes of AES-256 key
    string blobCid;       // IPFS CID of AES-encrypted .env blob
    uint256 version;      // increments on each rotation — optimistic locking
    uint256 updatedAt;
}
```

Key functions:

- `createProject(name)` → `projectId`
- `updateEnvironment(projectId, envHash, inKeyHigh, inKeyLow, blobCid, expectedVersion)`
- `grantAccess(projectId, envHash, member)` — single grant
- `batchGrantAccess(projectId, envHash, address[] members)` — bulk grant, one tx
- `revokeAccess(projectId, envHash, member)` — marks member inactive in `members` mapping + emits `AccessRevoked`; does NOT cryptographically revoke FHE access (no `revokeAllow` in CoFHE API). Caller must follow up with `updateEnvironment` (rotation) to cut off access at the ciphertext level.
- `transferOwnership(projectId, newOwner)` — replaces owner
- `addOwner(projectId, newOwner)` — multi-owner support
- `getEnvironment(projectId, envHash)` → `(aesKeyHigh, aesKeyLow, blobCid, version)`

---

## Frontend (Next.js)

Three views:

1. **Dashboard** — list projects, create project button
2. **Project view** — environments (dev/staging/prod), team members table, audit log
3. **Environment view** — decrypted secrets table (client-side only), rotate button, member access

Auth: wallet-based (wagmi + RainbowKit). No email/password.

---

## CLI (`fheenv`)

Node.js binary published to npm.

```bash
fheenv login                              # save wallet keyfile to ~/.fheenv/
fheenv init                               # create project, save projectId to .fheenv.json
fheenv push --env production              # encrypt local .env + upload
fheenv pull --env production              # download + decrypt → write .env.local
fheenv run --env production -- node app   # inject secrets into child process, no disk write
fheenv team add 0xABC --env production    # grant access
fheenv team remove 0xABC --env production # revoke + prompt to rotate
fheenv rotate --env production            # re-encrypt with new AES key
```

CI/CD usage (no MetaMask):

```bash
FHEENV_PRIVATE_KEY=0x... fheenv pull --env production
```

---

## Edge Cases & Mitigations

| Edge Case                        | Mitigation                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner wallet loss                | Multi-owner support (`addOwner`) from day one                                                                                                                                   |
| Revocation (no `revokeAllow`)    | CoFHE has no revoke primitive; `revokeAccess` marks member inactive in contract state, then CLI **forces** `rotate` immediately — new ciphertexts issued, old handles abandoned |
| Revocation with cached plaintext | Rotation changes the AES key entirely; old ciphertext is abandoned on-chain and on IPFS                                                                                         |
| IPFS blob unavailable            | Local cache at `~/.fheenv/cache/` + Pinata pinning                                                                                                                              |
| Concurrent rotation race         | `expectedVersion` param — second tx reverts if stale                                                                                                                            |
| Large teams (50+ members)        | `batchGrantAccess` — one tx for bulk; test gas on Sepolia before demo                                                                                                           |
| CI/CD key exposure               | Scoped read-only wallet per env; documented in README                                                                                                                           |
| Threshold Network downtime       | Local cache serves last-good decrypt; clear error shown                                                                                                                         |
| Env name case collision          | Names stored as `keccak256(bytes(lowercased))`                                                                                                                                  |
| Binary/multiline secret values   | AES encrypts raw bytes — no parsing until local decrypt                                                                                                                         |
| AES key strength                 | AES-256 (two euint128 handles) — security-first                                                                                                                                 |

---

## What's Out of Scope (Post-Hackathon)

- GitHub Actions native integration
- Kubernetes operator / Helm chart
- Terraform provider
- Secret version history / rollback UI
- SOC2 compliance features
- Organization-level billing

---

## Success Criteria (Hackathon MVP)

- [ ] Deploy `fheENVRegistry.sol` to Sepolia
- [ ] Web UI: create project, push encrypted env, manage team, decrypt in browser
- [ ] CLI: `fheenv push`, `fheenv pull`, `fheenv run` working end-to-end
- [ ] Demo: two wallets, one pushes secrets, second decrypts — Etherscan shows zero plaintext
- [ ] No plaintext secrets ever leave the user's device in any network request
