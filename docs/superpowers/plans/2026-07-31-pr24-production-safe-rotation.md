# PR #24 Production-Safe Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe owner-driven revoke-and-rotate, encrypted local wallets, trustworthy local audit records, and opt-in minimal analytics to current `dev` without adding an unattended signer or weakening the UUPS registry.

**Architecture:** Keep the existing monorepo and CLI package; do not create the `@fheenv/core` workspace from the old PR. Extract only a small dependency-injected rotation service and pure membership reducer so security behavior is directly testable. Keep analytics and audit as independent best-effort and required local services respectively.

**Tech Stack:** TypeScript, Node.js crypto/fetch/fs APIs, Commander, viem, Mocha, Node assert, Hardhat, OpenZeppelin UUPS.

---

### Task 1: Add a Runnable CLI Test Harness

**Files:**
- Modify: `fheenv/package.json`
- Create: `fheenv/cli/test/smoke.test.js`

- [ ] **Step 1: Add a failing smoke test**

```js
const assert = require("node:assert/strict");

describe("CLI test harness", function () {
  it("loads TypeScript CLI modules", function () {
    const config = require("../src/lib/config");
    assert.equal(typeof config.readConfig, "function");
  });
});
```

- [ ] **Step 2: Run the missing script and verify RED**

Run: `pnpm run test:cli`

Expected: failure because `test:cli` is not defined.

- [ ] **Step 3: Add the root script**

Add to `fheenv/package.json`:

```json
"test:cli": "mocha -r ts-node/register \"cli/test/**/*.test.js\""
```

- [ ] **Step 4: Run the harness and verify GREEN**

Run: `pnpm run test:cli`

Expected: `1 passing`.

- [ ] **Step 5: Commit**

```bash
git add fheenv/package.json fheenv/cli/test/smoke.test.js
git -c commit.gpgsign=false commit -m "test(cli): add runnable unit test harness"
```

### Task 2: Make Membership Replay Chronological and Bounded

**Files:**
- Modify: `fheenv/cli/src/lib/config.ts`
- Modify: `fheenv/cli/src/commands/init.ts`
- Modify: `fheenv/cli/src/lib/contracts-node.ts`
- Create: `fheenv/cli/test/membership.test.js`

- [ ] **Step 1: Write reducer and configuration tests**

Create tests that call this desired API:

```js
const assert = require("node:assert/strict");
const { reduceAccessEvents } = require("../src/lib/contracts-node");

describe("reduceAccessEvents", function () {
  const member = "0x1111111111111111111111111111111111111111";

  it("reactivates a member granted after revocation", function () {
    const result = reduceAccessEvents([
      { kind: "grant", member, blockNumber: 1n, logIndex: 0 },
      { kind: "revoke", member, blockNumber: 2n, logIndex: 0 },
      { kind: "grant", member, blockNumber: 3n, logIndex: 0 },
    ]);
    assert.deepEqual(result, [member]);
  });

  it("uses log index to order events in one block", function () {
    const result = reduceAccessEvents([
      { kind: "revoke", member, blockNumber: 4n, logIndex: 2 },
      { kind: "grant", member, blockNumber: 4n, logIndex: 1 },
    ]);
    assert.deepEqual(result, []);
  });
});
```

Add a configuration test that writes a temporary `.fheenv.json` without
`deployedAtBlock` and asserts that `readConfig()` throws
`"deployedAtBlock is missing"`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm run test:cli -- --grep "reduceAccessEvents|deployedAtBlock"`

Expected: failure because the reducer and required field do not exist.

- [ ] **Step 3: Implement the pure reducer**

Add to `contracts-node.ts`:

```ts
export interface AccessEvent {
  kind: "grant" | "revoke";
  member: Address;
  blockNumber: bigint;
  logIndex: number;
}

export function reduceAccessEvents(events: AccessEvent[]): Address[] {
  const state = new Map<string, { address: Address; active: boolean }>();
  const ordered = [...events].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
  for (const event of ordered) {
    state.set(event.member.toLowerCase(), {
      address: event.member,
      active: event.kind === "grant",
    });
  }
  return [...state.values()].filter(({ active }) => active).map(({ address }) => address);
}
```

Change `getActiveMembers()` to require `fromBlock: bigint`, fetch both event
types from that block, normalize their `blockNumber` and `logIndex`, and pass
the combined list to `reduceAccessEvents()`.

- [ ] **Step 4: Require and populate the deployment block**

Extend `FheEnvConfig`:

```ts
deployedAtBlock: number;
```

Validate parsed configuration fields in `readConfig()` and throw a recovery
message when `deployedAtBlock` is absent. In `initCommand()`, read
`publicClient.getBlockNumber()` immediately after project creation and persist
it as `deployedAtBlock`.

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm run test:cli
pnpm --filter fheenv build
```

Expected: all CLI tests pass and TypeScript compilation succeeds.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/lib/config.ts fheenv/cli/src/commands/init.ts fheenv/cli/src/lib/contracts-node.ts fheenv/cli/test/membership.test.js
git -c commit.gpgsign=false commit -m "fix(cli): replay bounded membership events chronologically"
```

### Task 3: Extract a Testable Manual Rotation Service

**Files:**
- Create: `fheenv/cli/src/lib/rotation.ts`
- Create: `fheenv/cli/test/rotation.test.js`
- Modify: `fheenv/cli/src/commands/rotate.ts`
- Modify: `fheenv/cli/src/index.ts`

- [ ] **Step 1: Write failing rotation tests**

The tests use injected functions and assert:

```js
const assert = require("node:assert/strict");
const {
  rotateEnvironment,
  PartialRotationError,
} = require("../src/lib/rotation");

it("excludes a removed member before regranting", async function () {
  const granted = [];
  const result = await rotateEnvironment(input, {
    ...workingDependencies,
    getActiveMembers: async () => [removed, retained],
    batchGrantAccess: async (_registry, _project, _env, members) => granted.push(...members),
  });
  assert.deepEqual(granted, [retained]);
  assert.equal(result.newVersion, 2n);
});

it("reports a partial rotation when regranting fails", async function () {
  await assert.rejects(
    rotateEnvironment(input, {
      ...workingDependencies,
      batchGrantAccess: async () => {
        throw new Error("regrant failed");
      },
    }),
    (error) =>
      error instanceof PartialRotationError &&
      error.newVersion === 2n &&
      error.newCid === "bafy-new",
  );
});
```

Also cover upload failure and version-update failure and assert they are not
reported as partial rotations because the on-chain environment did not change.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm run test:cli -- --grep "rotation"`

Expected: module-not-found failure for `src/lib/rotation`.

- [ ] **Step 3: Implement the minimal rotation service**

Create:

```ts
export class PartialRotationError extends Error {
  constructor(
    message: string,
    readonly newCid: string,
    readonly newVersion: bigint,
    readonly recoveryCommand: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PartialRotationError";
  }
}
```

Implement `rotateEnvironment(input, dependencies)` with this fixed sequence:

1. Load current environment and bounded active members.
2. Remove `excludeMembers` case-insensitively.
3. Generate and encrypt a fresh AES key.
4. Upload the encrypted blob.
5. FHE-encrypt both halves.
6. Update the environment with `expectedVersion`.
7. Batch regrant retained members.
8. Return the old/new CID, old/new version, and regranted members.

Wrap only step 7 in `PartialRotationError` and set the recovery command to:

```ts
`fheenv rotate --env ${envName} --regrant-only`
```

- [ ] **Step 4: Make `rotateCommand` a thin adapter**

Have `rotateCommand` read the plaintext file, config, and clients, then call
the service with `fromBlock: BigInt(config.deployedAtBlock)`. Catch
`PartialRotationError` only to print its exact recovery command, then rethrow so
Commander exits non-zero. Add `--regrant-only`; that path reads the bounded
active membership list and grants those addresses on the current handles
without creating another environment version. Regranting is idempotent, so
rerunning the recovery command is safe after a partially completed batch.

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm run test:cli
pnpm --filter fheenv build
```

Expected: all tests pass and the CLI builds.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/lib/rotation.ts fheenv/cli/src/commands/rotate.ts fheenv/cli/test/rotation.test.js
git -c commit.gpgsign=false commit -m "refactor(cli): isolate safe manual rotation pipeline"
```

### Task 4: Rotate Automatically After Team Removal

**Files:**
- Modify: `fheenv/cli/src/commands/team-remove.ts`
- Modify: `fheenv/cli/src/index.ts`
- Create: `fheenv/cli/test/team-remove.test.js`

- [ ] **Step 1: Write failing orchestration tests**

Use injected revoke and rotate functions to assert:

```js
it("rotates after a successful revocation by default", async function () {
  const calls = [];
  await removeMemberAndRotate(options, {
    revoke: async () => calls.push("revoke"),
    rotate: async () => calls.push("rotate"),
  });
  assert.deepEqual(calls, ["revoke", "rotate"]);
});

it("does not claim completion when rotation fails", async function () {
  await assert.rejects(
    removeMemberAndRotate(options, {
      revoke: async () => undefined,
      rotate: async () => {
        throw new Error("rotation failed");
      },
    }),
    /revoked but rotation failed/,
  );
});

it("requires an explicit noRotate flag to skip rotation", async function () {
  let rotated = false;
  const result = await removeMemberAndRotate(
    { ...options, noRotate: true },
    {
      revoke: async () => undefined,
      rotate: async () => {
        rotated = true;
      },
    },
  );
  assert.equal(rotated, false);
  assert.equal(result.rotationSkipped, true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm run test:cli -- --grep "team removal"`

Expected: failure because `removeMemberAndRotate` and `noRotate` do not exist.

- [ ] **Step 3: Implement orchestration**

Export a dependency-injected `removeMemberAndRotate()` from
`team-remove.ts`. It must:

- validate the address;
- revoke first;
- call the rotation service with the removed address excluded;
- throw an error beginning `Member revoked but rotation failed` on any rotation
  failure;
- return `{ rotationSkipped: boolean }`.

Add `--no-rotate` and `--file <path>` to the Commander command. The normal
success message must only appear after both revoke and rotation succeed.

- [ ] **Step 4: Run tests and build**

Run:

```bash
pnpm run test:cli
pnpm --filter fheenv build
```

Expected: all tests pass and TypeScript compilation succeeds.

- [ ] **Step 5: Commit**

```bash
git add fheenv/cli/src/commands/team-remove.ts fheenv/cli/src/index.ts fheenv/cli/test/team-remove.test.js
git -c commit.gpgsign=false commit -m "fix(cli): rotate keys after member removal"
```

### Task 5: Encrypt New Wallets and Migrate Legacy Wallets

**Files:**
- Modify: `fheenv/cli/src/lib/wallet.ts`
- Modify: `fheenv/cli/src/commands/login.ts`
- Create: `fheenv/cli/test/wallet.test.js`

- [ ] **Step 1: Write failing wallet-format tests**

Use a temporary wallet path injected into the wallet helpers and assert:

```js
it("never writes a new plaintext wallet", function () {
  saveWallet(privateKey, passphrase, path);
  const file = JSON.parse(fs.readFileSync(path, "utf8"));
  assert.equal(file.version, 2);
  assert.equal("privateKey" in file, false);
  assert.equal(loadWallet(passphrase, path), privateKey);
});

it("rejects the wrong passphrase", function () {
  saveWallet(privateKey, passphrase, path);
  assert.throws(() => loadWallet("wrong", path), /incorrect passphrase/);
});

it("migrates a legacy wallet without deleting it before replacement", function () {
  fs.writeFileSync(path, JSON.stringify({ privateKey }));
  migrateLegacyWallet(passphrase, path);
  assert.equal(loadWallet(passphrase, path), privateKey);
  assert.equal(JSON.parse(fs.readFileSync(path, "utf8")).version, 2);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm run test:cli -- --grep "wallet"`

Expected: failure because the desired encrypted APIs are absent.

- [ ] **Step 3: Implement version-2 wallet encryption**

Use Node `scryptSync` with `N=32768`, `r=8`, `p=1`, a random 32-byte salt,
and AES-256-GCM with a random 12-byte IV. Store only:

```ts
interface EncryptedKeyfile {
  version: 2;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}
```

Write the replacement to `wallet.json.tmp` with mode `0600`, fsync/close it,
then rename it over `wallet.json`. Reject blank passphrases. Legacy plaintext
wallets must throw migration guidance during normal loading instead of being
silently accepted. Export
`saveWallet(privateKey, passphrase, walletPath?)`,
`loadWallet(passphrase, walletPath?)`, and
`migrateLegacyWallet(passphrase, walletPath?)`; `loadAccountKey()` uses
`FHEENV_KEY_PASSPHRASE` to call `loadWallet()` for normal CLI operation.

- [ ] **Step 4: Update login**

Export the existing non-echoing `promptSecret`. Interactive login asks for and
confirms a non-empty passphrase. Non-interactive login requires
`FHEENV_KEY_PASSPHRASE`. Remove the path that creates a plaintext wallet.

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm run test:cli
pnpm --filter fheenv build
```

Expected: wallet tests and CLI build pass.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/lib/wallet.ts fheenv/cli/src/commands/login.ts fheenv/cli/test/wallet.test.js
git -c commit.gpgsign=false commit -m "security(cli): encrypt local wallet storage"
```

### Task 6: Add Honest Local Audit Records and CSV Export

**Files:**
- Create: `fheenv/cli/src/lib/audit.ts`
- Create: `fheenv/cli/src/commands/export-audit.ts`
- Modify: `fheenv/cli/src/commands/team-remove.ts`
- Modify: `fheenv/cli/src/lib/rotation.ts`
- Modify: `fheenv/cli/src/index.ts`
- Create: `fheenv/cli/test/audit.test.js`

- [ ] **Step 1: Write failing audit tests**

Assert that:

```js
it("throws when a required audit write fails", function () {
  assert.throws(
    () => appendAuditEvent(event, "/unwritable/audit.log"),
    /Unable to write local audit record/,
  );
});

it("escapes CSV cells deterministically", function () {
  assert.equal(toCsvCell('a,"b"'), '"a,""b"""');
});
```

Also write two JSONL records to a temporary path and assert that
`exportAuditRecords()` returns a header plus two stable CSV rows.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm run test:cli -- --grep "audit"`

Expected: module-not-found failure.

- [ ] **Step 3: Implement required local logging**

`appendAuditEvent()` writes one JSON object per line under
`~/.fheenv/audit.log` with mode `0600`. It catches the filesystem error only to
wrap it with `Unable to write local audit record`; callers decide whether the
operation can continue.

Event fields are restricted to timestamp, action, project ID, environment,
target address, old/new version, transaction hash when available, status, and
trigger. Secret values and decrypted content have no fields in the type.

Wire required audit writes into team removal and rotation for revoke,
completion, partial failure, full failure, and deliberate skip. A failed audit
write after a security-sensitive operation must be surfaced to the caller and
must not be reported as a clean success.

- [ ] **Step 4: Implement deterministic export**

`exportAuditRecords(logPath, from?, to?)` parses valid JSONL records, applies
date filters, sorts by timestamp, escapes CSV cells, and returns the CSV
string. The command writes to stdout or an explicit output file.

Register:

```text
fheenv export-audit [--output <path>] [--from <date>] [--to <date>]
```

Do not add the old Blockscout indexer.

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm run test:cli
pnpm --filter fheenv build
```

Expected: audit tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/lib/audit.ts fheenv/cli/src/commands/export-audit.ts fheenv/cli/src/commands/team-remove.ts fheenv/cli/src/lib/rotation.ts fheenv/cli/src/index.ts fheenv/cli/test/audit.test.js
git -c commit.gpgsign=false commit -m "feat(cli): add reliable local audit export"
```

### Task 7: Add Minimal Opt-In Product Analytics

**Files:**
- Create: `fheenv/cli/src/lib/analytics.ts`
- Create: `fheenv/cli/src/commands/analytics.ts`
- Modify: `fheenv/cli/src/commands/init.ts`
- Modify: `fheenv/cli/src/commands/push.ts`
- Modify: `fheenv/cli/src/commands/pull.ts`
- Modify: `fheenv/cli/src/commands/team-add.ts`
- Modify: `fheenv/cli/src/commands/team-remove.ts`
- Modify: `fheenv/cli/src/lib/rotation.ts`
- Modify: `fheenv/cli/src/index.ts`
- Create: `fheenv/cli/test/analytics.test.js`
- Modify: `fheenv/frontend/app/providers.tsx`
- Modify: `fheenv/frontend/package.json`

- [ ] **Step 1: Write failing CLI analytics tests**

Assert:

```js
it("does not send or create an identifier before consent", async function () {
  const sent = [];
  await captureAnalytics("cli_initialized", {}, { settingsPath, send: (body) => sent.push(body) });
  assert.deepEqual(sent, []);
  assert.equal(fs.existsSync(settingsPath), false);
});

it("sends only allowlisted properties after consent", async function () {
  enableAnalytics(settingsPath);
  const sent = [];
  await captureAnalytics(
    "rotation_completed",
    {
      success: true,
      durationBucket: "1-5s",
      wallet: "0xsecret",
      envName: "production",
    },
    { settingsPath, send: (body) => sent.push(body) },
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].properties.wallet, undefined);
  assert.equal(sent[0].properties.envName, undefined);
});

it("ignores transport failure", async function () {
  enableAnalytics(settingsPath);
  await captureAnalytics(
    "cli_initialized",
    {},
    { settingsPath, send: async () => { throw new Error("offline"); } },
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm run test:cli -- --grep "analytics"`

Expected: module-not-found failure.

- [ ] **Step 3: Implement analytics without a CLI dependency**

Store this global settings shape at `~/.fheenv/settings.json`:

```ts
interface AnalyticsSettings {
  analyticsConsent: true;
  analyticsId: string;
}
```

Generate `analyticsId` using `randomUUID()` only in `enableAnalytics()`.
`captureAnalytics()` accepts only the design's event union, rebuilds properties
from the explicit allowlist (`cliVersion`, `osFamily`, `success`,
`durationBucket`), posts with native `fetch`, and catches all transport errors.

Register:

```text
fheenv analytics enable
fheenv analytics disable
fheenv analytics status
```

Add `--analytics` to `fheenv init`; the flag calls `enableAnalytics()` before
capturing `cli_initialized`. Instrument only completed command outcomes and
rotation failures. Never pass raw command options into analytics.

- [ ] **Step 4: Add minimal frontend page-view analytics**

Add `posthog-js` to the frontend. Initialize it only when
`NEXT_PUBLIC_POSTHOG_KEY` exists, set `person_profiles: "never"`, disable
session recording, and capture anonymous page views. Do not send wallet,
project, environment, CID, transaction, or error fields.

- [ ] **Step 5: Run tests and builds**

Run:

```bash
pnpm install
pnpm run test:cli
pnpm --filter fheenv build
pnpm --filter frontend lint
pnpm --filter frontend build
```

Expected: analytics tests, CLI build, frontend lint, and frontend build pass.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src fheenv/cli/test/analytics.test.js fheenv/frontend/app/providers.tsx fheenv/frontend/package.json fheenv/pnpm-lock.yaml
git -c commit.gpgsign=false commit -m "feat(analytics): add minimal opt-in usage signals"
```

### Task 8: Reconcile Documentation and CI

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `fheenv/README.md`
- Modify: `fheenv/frontend/content/docs/cli/commands.mdx`
- Modify: `fheenv/frontend/content/docs/cli/ci-cd.mdx`
- Modify: `fheenv/.env.example`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a CI regression check**

Update the CLI job to run:

```yaml
- run: pnpm run test:cli
  working-directory: fheenv
```

No scheduled-rotation workflow is added.

- [ ] **Step 2: Document actual behavior**

Document:

- owner-driven removal rotates by default;
- `--no-rotate` is an explicit security exception;
- partial rotation exits non-zero with recovery guidance;
- wallets are encrypted and legacy wallets require migration;
- analytics are off by default, list every collected property, and explain
  enable/disable commands;
- local audit export is operational evidence, not a durable SOC 2 ledger;
- unattended rotation, external signer custody, production SOC 2 operation,
  and mainnet remain future gates.

Remove or correct any conflicting claims in the touched documentation.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run test
pnpm run test:cli
pnpm --filter fheenv build
pnpm --filter frontend lint
pnpm --filter frontend exec fumadocs-mdx
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend build
```

Expected: every command exits zero with no test failures or lint warnings.

- [ ] **Step 4: Verify prohibited scope is absent**

Run:

```bash
rg -n "FHEENV_PRIVATE_KEY|Rotator|grantAccessWithExpiry|expireAccess|rotate-check|setup-github-rotator|lit-signer|Implemented & operating" .github fheenv README.md SECURITY.md
```

Expected: no scheduled raw-key automation, Rotator role, fake expiry, stale Lit
signer, or implemented-and-operating compliance claim is introduced by this
repair. Legitimate documentation references must explicitly describe excluded
or future work.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml fheenv/.env.example README.md SECURITY.md fheenv/README.md fheenv/frontend/content/docs/cli/commands.mdx fheenv/frontend/content/docs/cli/ci-cd.mdx
git -c commit.gpgsign=false commit -m "docs: document production-safe manual rotation"
```

- [ ] **Step 6: Review final branch state**

Run:

```bash
git status --short
git log --oneline dev..HEAD
git diff --check dev...HEAD
git diff --stat dev...HEAD
```

Expected: clean worktree, focused commits, no whitespace errors, and only the
approved repair scope.
