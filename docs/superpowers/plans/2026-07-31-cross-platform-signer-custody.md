# Cross-Platform Signer Custody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove credentials from project files and provide production-safe WalletConnect, Ledger, AWS KMS, native OS keyring, and generic external-signer paths for the fheENV CLI.

**Architecture:** CLI commands receive a provider-neutral `CommandContext` containing a public client, a signer session, and a credential resolver. Project configuration stores only versioned non-secret settings and credential references; native keyrings or explicit headless providers resolve secret values. Signer adapters expose one Viem-compatible boundary so commands and CoFHE permit flows never handle raw private-key material.

**Tech Stack:** TypeScript, Node.js 22, Viem, Mocha, `@napi-rs/keyring`, WalletConnect Ethereum Provider, Ledger Device Management Kit, AWS SDK v3 KMS, `@noble/curves`, GitHub Actions OIDC.

---

## File and Responsibility Map

Create focused files under `fheenv/cli/src/lib`:

- `redaction.ts`: sensitive-value registry and safe error rendering.
- `credential-types.ts`: credential references, sources, and store interfaces.
- `credential-store.ts`: native keyring adapter and source resolver.
- `config-v2.ts`: version-2 schema, validation, public-RPC checks, and atomic migration.
- `signer-types.ts`: provider-neutral signer contracts and capability checks.
- `command-context.ts`: public client, credential resolver, and signer factory composition.
- `signers/local-encrypted.ts`: development-only compatibility adapter.
- `signers/walletconnect.ts`: EIP-1193 WalletConnect session and encrypted state envelope.
- `signers/ledger.ts`: Ledger device adapter.
- `signers/aws-kms.ts`: secp256k1 KMS signing and Ethereum signature conversion.
- `signers/external.ts`: bounded stdin/stdout protocol for institutional signers.

Create commands under `fheenv/cli/src/commands`:

- `credentials.ts`: set, status, and delete operations.
- `signer.ts`: signer configuration and status.
- `migrate-credentials.ts`: dry-run and atomic version-1 migration.

Tests mirror each unit under `fheenv/cli/test`. Platform and live-provider
workflows live in `.github/workflows`.

---

### Task 1: Add Security Dependencies and a Central Redactor

**Files:**

- Modify: `fheenv/package.json`
- Modify: `fheenv/pnpm-lock.yaml`
- Create: `fheenv/cli/src/lib/redaction.ts`
- Create: `fheenv/cli/test/redaction.test.js`

- [ ] **Step 1: Write failing canary-redaction tests**

```js
const assert = require("node:assert/strict");
const {
  SensitiveValueRegistry,
  sanitizeError,
} = require("../src/lib/redaction");

describe("sensitive value redaction", function () {
  it("removes registered values, credential URLs, and WalletConnect URIs", function () {
    const registry = new SensitiveValueRegistry();
    registry.register("pinata-secret-canary");
    const error = new Error(
      "pinata-secret-canary https://user:pass@example.test/rpc?api_key=abc " +
        "wc:topic@2?relay-protocol=irn&symKey=deadbeef",
    );
    const output = sanitizeError(error, registry);
    assert.doesNotMatch(
      output,
      /pinata-secret-canary|user:pass|api_key=abc|symKey=deadbeef/,
    );
    assert.match(output, /\[REDACTED\]/);
  });

  it("does not weaken redaction in debug mode", function () {
    const registry = new SensitiveValueRegistry();
    registry.register("debug-canary");
    assert.doesNotMatch(
      sanitizeError(
        { message: "debug-canary", stack: "debug-canary" },
        registry,
        {
          debug: true,
        },
      ),
      /debug-canary/,
    );
  });
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "sensitive value redaction"
```

Expected: FAIL because `../src/lib/redaction` does not exist.

- [ ] **Step 3: Implement the minimal redactor**

```ts
const WALLETCONNECT_URI = /wc:[^\s]+/gi;
const URL_CREDENTIAL = /(https?:\/\/)([^/\s@]+@)/gi;
const SENSITIVE_QUERY =
  /([?&](?:api[_-]?key|token|jwt|secret|password|symKey)=)[^&#\s]+/gi;

export class SensitiveValueRegistry {
  private readonly values = new Set<string>();

  register(value: string | undefined): void {
    if (value && value.length >= 4) this.values.add(value);
  }

  redact(input: string): string {
    let output = input;
    for (const value of this.values) {
      output = output.split(value).join("[REDACTED]");
    }
    return output
      .replace(WALLETCONNECT_URI, "[REDACTED_WALLETCONNECT_URI]")
      .replace(URL_CREDENTIAL, "$1[REDACTED]@")
      .replace(SENSITIVE_QUERY, "$1[REDACTED]");
  }
}

export function sanitizeError(
  error: unknown,
  registry: SensitiveValueRegistry,
  options: { debug?: boolean } = {},
): string {
  const value =
    error instanceof Error
      ? options.debug && error.stack
        ? error.stack
        : error.message
      : String(error);
  return registry.redact(value).slice(0, 8_192);
}
```

- [ ] **Step 4: Install pinned capability dependencies**

Run:

```bash
pnpm add @napi-rs/keyring @walletconnect/ethereum-provider qrcode-terminal @ledgerhq/device-management-kit @ledgerhq/device-signer-kit-ethereum @aws-sdk/client-kms @noble/curves
pnpm add -D @types/qrcode-terminal
```

Expected: package manifest and lockfile update without lifecycle-policy failure.

- [ ] **Step 5: Run tests, build, lint, and formatting**

Run:

```bash
CI=true pnpm run test:cli -- --grep "sensitive value redaction"
CI=true pnpm --filter fheenv build
CI=true pnpm run lint
CI=true pnpm run format:check
```

Expected: all commands exit zero.

- [ ] **Step 6: Commit**

```bash
git add fheenv/package.json fheenv/pnpm-lock.yaml fheenv/cli/src/lib/redaction.ts fheenv/cli/test/redaction.test.js
git -c commit.gpgsign=false commit -m "security(cli): add centralized secret redaction"
```

---

### Task 2: Define Credential References and Native Keyring Storage

**Files:**

- Create: `fheenv/cli/src/lib/credential-types.ts`
- Create: `fheenv/cli/src/lib/credential-store.ts`
- Create: `fheenv/cli/test/credential-store.test.js`

- [ ] **Step 1: Write failing credential-store contract tests**

```js
const assert = require("node:assert/strict");
const {
  NativeCredentialStore,
  parseCredentialReference,
  resolveCredential,
} = require("../src/lib/credential-store");

class MemoryBackend {
  values = new Map();
  async get(service, account) {
    return this.values.get(`${service}:${account}`) ?? null;
  }
  async set(service, account, value) {
    this.values.set(`${service}:${account}`, value);
  }
  async delete(service, account) {
    this.values.delete(`${service}:${account}`);
  }
}

describe("credential storage", function () {
  it("round-trips an opaque keyring reference", async function () {
    const store = new NativeCredentialStore(new MemoryBackend());
    await store.set("storage/pinata/default", "secret-canary");
    assert.equal(await store.get("storage/pinata/default"), "secret-canary");
    await store.delete("storage/pinata/default");
    assert.equal(await store.get("storage/pinata/default"), null);
  });

  it("resolves only the explicitly selected source", async function () {
    const store = new NativeCredentialStore(new MemoryBackend());
    await store.set("storage/pinata/default", "keyring-value");
    const value = await resolveCredential(
      parseCredentialReference("keyring://storage/pinata/default"),
      {
        keyring: store,
        environment: { FHEENV_PINATA_JWT: "environment-value" },
      },
    );
    assert.equal(value, "keyring-value");
  });

  it("rejects raw private-key environment references in production", async function () {
    await assert.rejects(
      resolveCredential(parseCredentialReference("env://FHEENV_PRIVATE_KEY"), {
        mode: "production",
        environment: { FHEENV_PRIVATE_KEY: `0x${"11".repeat(32)}` },
      }),
      /private-key environment references are disabled in production/i,
    );
  });
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "credential storage"
```

Expected: FAIL because the credential modules do not exist.

- [ ] **Step 3: Define exact credential types**

```ts
export type SecurityMode = "production" | "development";

export type CredentialReference =
  | { source: "keyring"; key: string }
  | { source: "env"; variable: string }
  | { source: "exec"; provider: string; key: string };

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  probe(): Promise<{ available: boolean; backend: string; reason?: string }>;
}

export interface NativeKeyringBackend {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}
```

- [ ] **Step 4: Implement direct native keyring and explicit resolution**

Use `@napi-rs/keyring` only through a backend wrapper. Construct
`new Entry("fheenv", account)` and call `getPassword`, `setPassword`, and
`deletePassword`. Do not add subprocess fallbacks.

`parseCredentialReference` accepts only:

```text
keyring://<key>
env://<UPPERCASE_VARIABLE>
exec://<provider>/<key>
```

Reject `..`, empty components, control characters, and references longer than
512 bytes.

`resolveCredential` must:

```ts
switch (reference.source) {
  case "keyring":
    return requireValue(await dependencies.keyring?.get(reference.key));
  case "env":
    if (
      dependencies.mode === "production" &&
      reference.variable === "FHEENV_PRIVATE_KEY"
    ) {
      throw new Error(
        "Raw private-key environment references are disabled in production.",
      );
    }
    return requireValue(dependencies.environment?.[reference.variable]);
  case "exec":
    return requireValue(
      await dependencies.externalSecretProvider?.resolve(
        reference.provider,
        reference.key,
      ),
    );
}
```

Register every resolved value with `SensitiveValueRegistry`.

- [ ] **Step 5: Run targeted and complete CLI tests**

Run:

```bash
CI=true pnpm run test:cli -- --grep "credential storage"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: credential tests and all existing CLI tests pass.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/lib/credential-types.ts fheenv/cli/src/lib/credential-store.ts fheenv/cli/test/credential-store.test.js
git -c commit.gpgsign=false commit -m "security(cli): add native credential storage"
```

---

### Task 3: Add Credential-Free Version-2 Config and Atomic Migration

**Files:**

- Create: `fheenv/cli/src/lib/config-v2.ts`
- Create: `fheenv/cli/src/commands/migrate-credentials.ts`
- Modify: `fheenv/cli/src/lib/config.ts`
- Modify: `fheenv/cli/src/commands/init.ts`
- Modify: `fheenv/cli/src/index.ts`
- Create: `fheenv/cli/test/config-migration.test.js`

- [ ] **Step 1: Write failing migration tests**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { migrateConfigV1ToV2, readConfigV2 } = require("../src/lib/config-v2");

describe("credential-free project config", function () {
  it("stores the secret before atomically removing it from config", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migrate-"));
    const configPath = path.join(directory, ".fheenv.json");
    const jwt = "pinata-secret-canary";
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectId: 1,
        registryAddress: "0x1111111111111111111111111111111111111111",
        rpcUrl: "https://rpc.example",
        chainId: 11155111,
        pinataJwt: jwt,
        deployedAtBlock: 10,
      }),
    );
    const writes = [];
    await migrateConfigV1ToV2(configPath, {
      credentialRef: "keyring://storage/pinata/default",
      setCredential: async (_reference, value) => writes.push(value),
      readCredential: async () => jwt,
    });
    assert.deepEqual(writes, [jwt]);
    const migratedText = fs.readFileSync(configPath, "utf8");
    assert.doesNotMatch(migratedText, /pinata-secret-canary|pinataJwt/);
    assert.equal(readConfigV2(configPath).version, 2);
  });

  it("leaves the original untouched when credential verification fails", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fheenv-migrate-"));
    const configPath = path.join(directory, ".fheenv.json");
    const original = JSON.stringify({
      projectId: 1,
      registryAddress: "0x1111111111111111111111111111111111111111",
      rpcUrl: "https://rpc.example",
      chainId: 11155111,
      pinataJwt: "original-canary",
      deployedAtBlock: 10,
    });
    fs.writeFileSync(configPath, original);
    await assert.rejects(
      migrateConfigV1ToV2(configPath, {
        credentialRef: "keyring://storage/pinata/default",
        setCredential: async () => undefined,
        readCredential: async () => "wrong-value",
      }),
      /verification failed/i,
    );
    assert.equal(fs.readFileSync(configPath, "utf8"), original);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "credential-free project config"
```

Expected: FAIL because `config-v2` does not exist.

- [ ] **Step 3: Implement the version-2 schema**

```ts
export interface FheEnvConfigV2 {
  version: 2;
  projectId: number;
  registryAddress: string;
  chainId: number;
  rpc: { url: string } | { credentialRef: string };
  deployedAtBlock?: number;
  securityMode: "production" | "development";
  signer:
    | { type: "walletconnect"; credentialRef: string; expectedAddress?: string }
    | { type: "ledger"; derivationPath: string; expectedAddress?: string }
    | { type: "aws-kms"; keyId: string; expectedAddress: string }
    | { type: "external"; provider: string; expectedAddress: string }
    | { type: "local-encrypted"; expectedAddress?: string };
  storage: {
    provider: "pinata";
    credentialRef: string;
  };
}
```

Validate integer IDs, Ethereum addresses, non-negative deployment blocks,
allowed signer discriminants, and credential-reference syntax.

Public RPC URLs must be HTTPS and must reject URL user information and query
keys matching `key`, `token`, `secret`, `password`, `jwt`, or `auth`.

- [ ] **Step 4: Implement fail-closed atomic migration**

Use a timing-safe comparison of SHA-256 digests for credential read-back.
Write the new config to a same-directory temporary file with mode `0600`,
`fsync` it, rename it over the original, then chmod the result `0644` because
the version-2 file is safe to commit.

The dry run returns:

```ts
{
  fromVersion: 1,
  toVersion: 2,
  movedFields: ["pinataJwt"],
  destinationReferences: ["keyring://storage/pinata/default"],
}
```

It must never include values.

- [ ] **Step 5: Update init and CLI options**

Remove `--pinata-jwt <jwt>`. Add:

```text
--storage-credential <reference>
--signer <walletconnect|ledger|aws-kms|external|local-encrypted>
--security-mode <production|development>
```

`init` resolves and validates the storage credential before creating the
project but writes only its reference.

Add:

```text
fheenv migrate credentials
fheenv migrate credentials --dry-run
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "credential-free project config"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
CI=true pnpm run lint
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add fheenv/cli/src/lib/config-v2.ts fheenv/cli/src/lib/config.ts fheenv/cli/src/commands/init.ts fheenv/cli/src/commands/migrate-credentials.ts fheenv/cli/src/index.ts fheenv/cli/test/config-migration.test.js
git -c commit.gpgsign=false commit -m "security(cli): remove credentials from project config"
```

---

### Task 4: Create the Signer Contract and Development Adapter

**Files:**

- Create: `fheenv/cli/src/lib/signer-types.ts`
- Create: `fheenv/cli/src/lib/signers/local-encrypted.ts`
- Create: `fheenv/cli/src/lib/command-context.ts`
- Modify: `fheenv/cli/src/lib/wallet.ts`
- Create: `fheenv/cli/test/signer-contract.test.js`

- [ ] **Step 1: Write failing shared signer tests**

```js
const assert = require("node:assert/strict");
const {
  assertSignerCapabilities,
  createSignerSession,
} = require("../src/lib/signer-types");

describe("signer provider contract", function () {
  it("rejects a signer missing typed-data support before CoFHE work starts", function () {
    assert.throws(
      () =>
        assertSignerCapabilities(
          { transactions: true, messages: true, typedData: false },
          ["transactions", "typedData"],
        ),
      /typedData/,
    );
  });

  it("closes each session exactly once", async function () {
    let closes = 0;
    const session = createSignerSession({
      type: "local-encrypted",
      address: "0x1111111111111111111111111111111111111111",
      walletClient: {},
      capabilities: { transactions: true, messages: true, typedData: true },
      close: async () => {
        closes += 1;
      },
    });
    await session.close();
    await session.close();
    assert.equal(closes, 1);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "signer provider contract"
```

Expected: FAIL because signer types do not exist.

- [ ] **Step 3: Implement signer types and one-close sessions**

Define:

```ts
export interface SignerCapabilities {
  transactions: boolean;
  messages: boolean;
  typedData: boolean;
}

export interface SignerProvider {
  connect(input: {
    chain: Chain;
    rpcUrl: string;
    expectedAddress?: Address;
  }): Promise<SignerSession>;
}
```

Wrap `close` so subsequent calls return without invoking the provider again.

- [ ] **Step 4: Move existing encrypted-wallet behavior behind the adapter**

`local-encrypted` must:

- reject `securityMode: "production"`;
- use the existing AES-256-GCM keyfile;
- permit `FHEENV_PRIVATE_KEY` only in development and emit a warning;
- return a Viem wallet client and all three capabilities.

Delete no legacy wallet code in this task.

- [ ] **Step 5: Compose `CommandContext`**

`createCommandContext(config, dependencies)` resolves the RPC source, creates
the public client, selects the configured signer provider, verifies the
expected address, and returns a closeable context.

If setup fails after a provider connects, close it before rethrowing the
sanitized error.

- [ ] **Step 6: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "signer provider contract"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add fheenv/cli/src/lib/signer-types.ts fheenv/cli/src/lib/signers/local-encrypted.ts fheenv/cli/src/lib/command-context.ts fheenv/cli/src/lib/wallet.ts fheenv/cli/test/signer-contract.test.js
git -c commit.gpgsign=false commit -m "refactor(cli): introduce signer provider contract"
```

---

### Task 5: Refactor Every CLI Operation onto `CommandContext`

**Files:**

- Modify: `fheenv/cli/src/commands/init.ts`
- Modify: `fheenv/cli/src/commands/push.ts`
- Modify: `fheenv/cli/src/commands/pull.ts`
- Modify: `fheenv/cli/src/commands/run.ts`
- Modify: `fheenv/cli/src/commands/rotate.ts`
- Modify: `fheenv/cli/src/commands/team-add.ts`
- Modify: `fheenv/cli/src/commands/team-remove.ts`
- Modify: `fheenv/cli/src/commands/team-remove-owner.ts`
- Create: `fheenv/cli/test/command-context.test.js`

- [ ] **Step 1: Write a failing lifecycle test**

```js
const assert = require("node:assert/strict");
const { withCommandContext } = require("../src/lib/command-context");

describe("command context lifecycle", function () {
  it("closes the signer on success and failure", async function () {
    for (const failure of [false, true]) {
      let closed = 0;
      await assert.doesNotReject(async () => {
        try {
          await withCommandContext(
            async () => ({ close: async () => void (closed += 1) }),
            async () => {
              if (failure) throw new Error("operation failed");
            },
          );
        } catch (error) {
          assert.equal(error.message, "operation failed");
        }
      });
      assert.equal(closed, 1);
    }
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "command context lifecycle"
```

Expected: FAIL because `withCommandContext` is absent.

- [ ] **Step 3: Implement `withCommandContext`**

```ts
export async function withCommandContext<T>(
  create: () => Promise<CommandContext>,
  operation: (context: CommandContext) => Promise<T>,
): Promise<T> {
  const context = await create();
  try {
    return await operation(context);
  } finally {
    await context.close();
  }
}
```

- [ ] **Step 4: Refactor commands one at a time**

For every command:

1. replace `createClients` with `withCommandContext`;
2. use `context.publicClient`, `context.signer.walletClient`, and
   `context.signer.address`;
3. resolve Pinata through `context.credentials` only in push/rotate;
4. declare required signer capabilities before network or file mutation;
5. preserve existing audit and analytics behavior;
6. sanitize provider errors before displaying them.

No command may call `loadAccountKey`.

- [ ] **Step 5: Prove the raw-key path is isolated**

Run:

```bash
rg -n "createClients|loadAccountKey|pinataJwt" fheenv/cli/src/commands
```

Expected: no matches outside migration or explicit development-login code.

- [ ] **Step 6: Run the complete CLI suite**

Run:

```bash
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
CI=true pnpm run lint
CI=true pnpm run format:check
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add fheenv/cli/src/commands fheenv/cli/src/lib/command-context.ts fheenv/cli/test/command-context.test.js
git -c commit.gpgsign=false commit -m "refactor(cli): route commands through signer context"
```

---

### Task 6: Implement WalletConnect Terminal QR Signing

**Files:**

- Create: `fheenv/cli/src/lib/signers/walletconnect.ts`
- Create: `fheenv/cli/src/lib/walletconnect-state.ts`
- Create: `fheenv/cli/test/walletconnect.test.js`
- Modify: `fheenv/cli/src/lib/command-context.ts`

- [ ] **Step 1: Write failing pairing and request tests**

```js
const assert = require("node:assert/strict");
const {
  WalletConnectSignerProvider,
} = require("../src/lib/signers/walletconnect");

describe("WalletConnect signer", function () {
  it("never logs the pairing URI and verifies the selected account", async function () {
    const rendered = [];
    const provider = new WalletConnectSignerProvider({
      createProvider: async () => ({
        accounts: ["0x1111111111111111111111111111111111111111"],
        chainId: 11155111,
        on(event, listener) {
          if (event === "display_uri") {
            listener("wc:topic@2?relay-protocol=irn&symKey=secret-canary");
          }
        },
        connect: async () => undefined,
        disconnect: async () => undefined,
        request: async () => "0xtransaction",
      }),
      renderQr: (uri) => rendered.push(uri),
      writeOutput: () => undefined,
    });
    const session = await provider.connect({
      chain: { id: 11155111 },
      rpcUrl: "https://rpc.example",
      expectedAddress: "0x1111111111111111111111111111111111111111",
    });
    assert.equal(rendered.length, 1);
    assert.equal(
      session.address.toLowerCase(),
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("rejects wrong-chain sessions", async function () {
    const provider = new WalletConnectSignerProvider({
      createProvider: async () => ({
        accounts: ["0x1111111111111111111111111111111111111111"],
        chainId: 84532,
        on() {},
        connect: async () => undefined,
        disconnect: async () => undefined,
        request: async () => "0xtransaction",
      }),
      renderQr: () => undefined,
      writeOutput: () => undefined,
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
      }),
      /wrong chain/i,
    );
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "WalletConnect signer"
```

Expected: FAIL because the WalletConnect adapter does not exist.

- [ ] **Step 3: Implement ephemeral pairing and EIP-1193 transport**

Initialize `EthereumProvider` with:

```ts
{
  projectId,
  chains: [chain.id],
  methods: [
    "eth_sendTransaction",
    "personal_sign",
    "eth_signTypedData_v4",
  ],
  events: ["accountsChanged", "chainChanged"],
  showQrModal: false,
}
```

Render `display_uri` directly with `qrcode-terminal`. Do not pass the URI to
the general logger or redactor registry.

Create a Viem wallet client with `custom(eip1193Provider)`. Validate the
selected account and chain after connection and before each request.

- [ ] **Step 4: Implement encrypted session state**

Store a random 32-byte state key under
`keyring://walletconnect/state-key`. Store the WalletConnect state in
`~/.fheenv/walletconnect-state.v1` using AES-256-GCM, atomic replacement, mode
`0600`, and authenticated metadata containing schema version and installation
ID.

If the state key is missing or decryption fails, delete no credential,
quarantine the unreadable state file with mode `0600`, and start a fresh
pairing.

- [ ] **Step 5: Cover failure behavior**

Add table-driven tests with these exact injected events and expected stable
errors:

| Injected condition                                              | Expected code                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `request` throws error code `4001`                              | `WALLET_REJECTED`                                           |
| `connect` does not resolve before the injected 50 ms timeout    | `WALLETCONNECT_TIMEOUT`                                     |
| `accountsChanged` emits an address other than `expectedAddress` | `WALLETCONNECT_ACCOUNT_CHANGED`                             |
| `chainChanged` emits `0x14a34` while Sepolia is configured      | `WALLETCONNECT_CHAIN_CHANGED`                               |
| provider emits `disconnect` during an outstanding request       | `WALLETCONNECT_DISCONNECTED`                                |
| `eth_sendTransaction` returns `"not-a-hash"`                    | `WALLETCONNECT_INVALID_RESPONSE`                            |
| encrypted state authentication tag is modified                  | `WALLETCONNECT_STATE_CORRUPT` followed by fresh pairing     |
| state file exists but `walletconnect/state-key` is missing      | `WALLETCONNECT_STATE_KEY_MISSING` followed by fresh pairing |

Every case must close the provider and return a non-zero error without pairing
material.

- [ ] **Step 6: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "WalletConnect signer"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add fheenv/cli/src/lib/signers/walletconnect.ts fheenv/cli/src/lib/walletconnect-state.ts fheenv/cli/src/lib/command-context.ts fheenv/cli/test/walletconnect.test.js
git -c commit.gpgsign=false commit -m "feat(cli): add WalletConnect QR signer"
```

---

### Task 7: Implement Ledger Hardware Signing

**Files:**

- Create: `fheenv/cli/src/lib/signers/ledger.ts`
- Create: `fheenv/cli/test/ledger.test.js`
- Modify: `fheenv/cli/src/lib/command-context.ts`

- [ ] **Step 1: Write failing device-contract tests**

```js
const assert = require("node:assert/strict");
const { LedgerSignerProvider } = require("../src/lib/signers/ledger");

describe("Ledger signer", function () {
  it("verifies the displayed device address", async function () {
    const provider = new LedgerSignerProvider({
      device: {
        getAddress: async () => "0x1111111111111111111111111111111111111111",
        signTransaction: async () => ({ r: "0x1", s: "0x2", v: 27 }),
        signMessage: async () => ({ r: "0x1", s: "0x2", v: 27 }),
        signTypedData: async () => ({ r: "0x1", s: "0x2", v: 27 }),
        close: async () => undefined,
      },
    });
    const session = await provider.connect({
      chain: { id: 11155111 },
      rpcUrl: "https://rpc.example",
      expectedAddress: "0x1111111111111111111111111111111111111111",
      derivationPath: "44'/60'/0'/0/0",
    });
    assert.equal(
      session.address.toLowerCase(),
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("fails before signing when the device address differs", async function () {
    const provider = new LedgerSignerProvider({
      device: {
        getAddress: async () => "0x2222222222222222222222222222222222222222",
        close: async () => undefined,
      },
    });
    await assert.rejects(
      provider.connect({
        chain: { id: 11155111 },
        rpcUrl: "https://rpc.example",
        expectedAddress: "0x1111111111111111111111111111111111111111",
        derivationPath: "44'/60'/0'/0/0",
      }),
      /Ledger address does not match/i,
    );
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "Ledger signer"
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement a small Ledger device boundary**

Wrap the official Device Management Kit and Ethereum Signer Kit behind:

```ts
interface LedgerDevice {
  getAddress(path: string, display: boolean, chainId: number): Promise<Address>;
  signTransaction(path: string, serialized: Hex): Promise<Signature>;
  signMessage(path: string, message: Hex): Promise<Signature>;
  signTypedData(path: string, typedData: unknown): Promise<Signature>;
  close(): Promise<void>;
}
```

Require address display during initial configuration. On later connections,
verify the derived address before returning a session.

- [ ] **Step 4: Build a Viem custom account**

Use `toAccount` with `signTransaction`, `signMessage`, and `signTypedData`
delegating to `LedgerDevice`. Serialize the signature in canonical Ethereum
form and locally recover the configured address before returning it.

- [ ] **Step 5: Add device failure tests**

Add table-driven tests with the following device errors and CLI error codes:

| Device result                               | Expected code                   |
| ------------------------------------------- | ------------------------------- |
| discovery returns no device                 | `LEDGER_NOT_FOUND`              |
| APDU status is `0x6e00`                     | `LEDGER_ETHEREUM_APP_REQUIRED`  |
| APDU status is `0x6985`                     | `LEDGER_REJECTED`               |
| derived address differs from expected       | `LEDGER_ADDRESS_MISMATCH`       |
| typed-data action reports unsupported       | `LEDGER_TYPED_DATA_UNSUPPORTED` |
| session closes during an outstanding action | `LEDGER_DISCONNECTED`           |

The wrong-derivation-path case uses two deterministic derived addresses and
asserts that no signing method is called after address verification fails.

- [ ] **Step 6: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "Ledger signer"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add fheenv/cli/src/lib/signers/ledger.ts fheenv/cli/src/lib/command-context.ts fheenv/cli/test/ledger.test.js
git -c commit.gpgsign=false commit -m "feat(cli): add Ledger hardware signer"
```

---

### Task 8: Implement AWS KMS secp256k1 Signing

**Files:**

- Create: `fheenv/cli/src/lib/signers/aws-kms.ts`
- Create: `fheenv/cli/src/lib/signing-policy.ts`
- Create: `fheenv/cli/test/aws-kms.test.js`
- Modify: `fheenv/cli/src/lib/command-context.ts`

- [ ] **Step 1: Write failing deterministic signature tests**

```js
const assert = require("node:assert/strict");
const {
  AwsKmsSignerProvider,
  completeKmsSignature,
} = require("../src/lib/signers/aws-kms");

describe("AWS KMS signer", function () {
  it("parses DER, normalizes low-s, and recovers the configured address", async function () {
    const fixture = require("./fixtures/aws-kms-secp256k1.json");
    const signature = completeKmsSignature({
      digest: fixture.digest,
      publicKeyDer: Buffer.from(fixture.publicKeyDer, "hex"),
      signatureDer: Buffer.from(fixture.signatureDer, "hex"),
      expectedAddress: fixture.address,
    });
    assert.equal(
      signature.recoveredAddress.toLowerCase(),
      fixture.address.toLowerCase(),
    );
    assert.equal(BigInt(signature.s) <= BigInt(fixture.halfCurveOrder), true);
  });

  it("rejects an unapproved destination before calling KMS", async function () {
    let calls = 0;
    const fixture = require("./fixtures/aws-kms-secp256k1.json");
    const provider = new AwsKmsSignerProvider({
      kms: {
        getPublicKey: async () => Buffer.from(fixture.publicKeyDer, "hex"),
        signDigest: async () => {
          calls += 1;
          return Buffer.from(fixture.signatureDer, "hex");
        },
      },
      keyId: "arn:aws:kms:us-east-1:111122223333:key/test",
      policy: fixture.policy,
    });
    const session = await provider.connect({
      chain: { id: 11155111 },
      rpcUrl: "https://rpc.example",
      expectedAddress: fixture.address,
    });
    await assert.rejects(
      session.walletClient.account.signTransaction({
        chainId: 11155111,
        to: "0x2222222222222222222222222222222222222222",
        data: "0x12345678",
        gas: 100_000n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
        nonce: 0,
        value: 0n,
      }),
      /destination is not allowed/i,
    );
    assert.equal(calls, 0);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "AWS KMS signer"
```

Expected: FAIL because the KMS adapter and fixture do not exist.

- [ ] **Step 3: Add a deterministic secp256k1 fixture**

Create `fheenv/cli/test/fixtures/aws-kms-secp256k1.json` containing:

- DER SubjectPublicKeyInfo;
- digest;
- DER ECDSA signature;
- expected address;
- expected canonical `r`, `s`, and recovery bit;
- policy with Sepolia chain ID, registry address, selectors, zero value, and fee
  ceiling.

Generate it once from a test-only key and commit only public/signature data.

- [ ] **Step 4: Implement KMS conversion**

Use `GetPublicKeyCommand` and `SignCommand` with:

```ts
{
  KeyId: keyId,
  Message: digestBytes,
  MessageType: "DIGEST",
  SigningAlgorithm: "ECDSA_SHA_256",
}
```

Parse DER integers with strict minimal-encoding validation. Normalize high-s
using secp256k1 curve order. Try both recovery IDs and select the public key
matching KMS. Verify every returned signature before use.

Export `completeKmsSignature` as the pure conversion boundary used by the
adapter and deterministic tests.

- [ ] **Step 5: Implement signing policy**

Before KMS invocation, enforce:

```ts
interface SigningPolicy {
  chainIds: number[];
  contracts: Record<Address, Hex[]>;
  maxValueWei: bigint;
  maxGas: bigint;
  maxFeePerGasWei: bigint;
}
```

Reject unknown chains, contracts, selectors, non-zero value beyond the limit,
and excessive fee fields. Policy errors must not include full calldata.

- [ ] **Step 6: Build the Viem account**

Implement transaction, message, and typed-data signing with local hashing and
KMS digest signing. The AWS SDK uses its default credential chain; do not add
static AWS credential options.

- [ ] **Step 7: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "AWS KMS signer"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: all commands exit zero.

- [ ] **Step 8: Commit**

```bash
git add fheenv/cli/src/lib/signers/aws-kms.ts fheenv/cli/src/lib/signing-policy.ts fheenv/cli/src/lib/command-context.ts fheenv/cli/test/aws-kms.test.js fheenv/cli/test/fixtures/aws-kms-secp256k1.json
git -c commit.gpgsign=false commit -m "feat(cli): add AWS KMS signer"
```

---

### Task 9: Implement the Generic External Signer Protocol

**Files:**

- Create: `fheenv/cli/src/lib/signers/external.ts`
- Create: `fheenv/cli/test/external-signer.test.js`
- Create: `fheenv/cli/test/fixtures/external-signer-fixture.js`
- Modify: `fheenv/cli/src/lib/command-context.ts`

- [ ] **Step 1: Write failing protocol tests**

```js
const assert = require("node:assert/strict");
const path = require("node:path");
const { ExternalSignerProvider } = require("../src/lib/signers/external");

describe("external signer protocol", function () {
  it("sends payload over stdin and verifies the response signer", async function () {
    const provider = new ExternalSignerProvider({
      executable: process.execPath,
      executableArgs: [
        path.resolve(__dirname, "fixtures/external-signer-fixture.js"),
      ],
      expectedAddress: "0x1111111111111111111111111111111111111111",
      timeoutMs: 2_000,
    });
    const response = await provider.request({
      protocolVersion: 1,
      requestId: "00000000-0000-4000-8000-000000000001",
      operation: "getAddress",
      chainId: 11155111,
      expectedAddress: "0x1111111111111111111111111111111111111111",
      payload: {},
    });
    assert.equal(response.requestId, "00000000-0000-4000-8000-000000000001");
  });

  it("kills providers that exceed timeout or output limits", async function () {
    const fixture = path.resolve(
      __dirname,
      "fixtures/external-signer-fixture.js",
    );
    for (const [mode, expected] of [
      ["slow", /EXTERNAL_SIGNER_TIMEOUT/],
      ["oversized", /EXTERNAL_SIGNER_OUTPUT_LIMIT/],
    ]) {
      const provider = new ExternalSignerProvider({
        executable: process.execPath,
        executableArgs: [fixture, mode],
        expectedAddress: "0x1111111111111111111111111111111111111111",
        timeoutMs: 50,
      });
      await assert.rejects(
        provider.request({
          protocolVersion: 1,
          requestId: "00000000-0000-4000-8000-000000000001",
          operation: "getAddress",
          chainId: 11155111,
          expectedAddress: "0x1111111111111111111111111111111111111111",
          payload: {},
        }),
        expected,
      );
    }
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "external signer protocol"
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement strict process execution**

Use `spawn(executable, fixedArgs, { shell: false, env: allowlistedEnv })`.

Enforce:

- absolute executable path in production;
- 1 MiB request and response limits;
- one JSON line request and one JSON line response;
- UUID request match;
- protocol version `1`;
- operation allowlist;
- configurable timeout capped at 120 seconds;
- SIGTERM followed by SIGKILL after two seconds;
- sanitized stderr capped at 8 KiB.

- [ ] **Step 4: Verify every result**

Recover and compare signer addresses for returned signatures. For submitted
transactions, fetch the transaction and verify chain, sender, destination,
value, and calldata selector before accepting its hash.

- [ ] **Step 5: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "external signer protocol"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: all commands exit zero.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/lib/signers/external.ts fheenv/cli/src/lib/command-context.ts fheenv/cli/test/external-signer.test.js fheenv/cli/test/fixtures/external-signer-fixture.js
git -c commit.gpgsign=false commit -m "feat(cli): add external signer protocol"
```

---

### Task 10: Add Credential and Signer Management Commands

**Files:**

- Create: `fheenv/cli/src/commands/credentials.ts`
- Create: `fheenv/cli/src/commands/signer.ts`
- Modify: `fheenv/cli/src/index.ts`
- Create: `fheenv/cli/test/credential-commands.test.js`

- [ ] **Step 1: Write failing command-service tests**

```js
const assert = require("node:assert/strict");
const {
  setCredential,
  credentialStatus,
} = require("../src/commands/credentials");

describe("credential management commands", function () {
  it("stores hidden input and returns metadata only", async function () {
    const writes = [];
    const result = await setCredential(
      { reference: "keyring://storage/pinata/default" },
      {
        promptSecret: async () => "secret-canary",
        store: { set: async (key, value) => writes.push([key, value]) },
      },
    );
    assert.deepEqual(writes, [["storage/pinata/default", "secret-canary"]]);
    assert.deepEqual(result, {
      reference: "keyring://storage/pinata/default",
      stored: true,
    });
    assert.doesNotMatch(JSON.stringify(result), /secret-canary/);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
CI=true pnpm run test:cli -- --grep "credential management commands"
```

Expected: FAIL because the commands do not exist.

- [ ] **Step 3: Implement credential commands**

Expose:

```text
fheenv credentials set <reference>
fheenv credentials status [reference]
fheenv credentials delete <reference>
```

`set` accepts no value flag. It uses a non-echoing TTY prompt or explicit
`--stdin`. `status` reports source, presence, and backend only. `delete`
requires confirmation on a TTY or `--yes` in automation.

- [ ] **Step 4: Implement signer configuration**

Expose:

```text
fheenv signer configure walletconnect --credential keyring://walletconnect/project-id
fheenv signer configure ledger --derivation-path "44'/60'/0'/0/0"
fheenv signer configure aws-kms --key-id <arn> --expected-address <address>
fheenv signer configure external --provider <name> --expected-address <address>
fheenv signer configure local-encrypted
fheenv signer status
```

Configuration writes only non-secret values. `local-encrypted` is rejected
unless security mode is development. WalletConnect and Ledger configuration
must prove control of the selected address before persisting it.

- [ ] **Step 5: Run tests and build**

Run:

```bash
CI=true pnpm run test:cli -- --grep "credential management commands"
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
```

Expected: all commands exit zero.

- [ ] **Step 6: Commit**

```bash
git add fheenv/cli/src/commands/credentials.ts fheenv/cli/src/commands/signer.ts fheenv/cli/src/index.ts fheenv/cli/test/credential-commands.test.js
git -c commit.gpgsign=false commit -m "feat(cli): add credential and signer management"
```

---

### Task 11: Add Cross-Platform and Live AWS Integration Workflows

**Files:**

- Create: `.github/workflows/credential-stores.yml`
- Create: `.github/workflows/aws-kms-signer.yml`
- Create: `fheenv/cli/test/native-keyring.integration.test.js`
- Create: `fheenv/cli/test/aws-kms.integration.test.js`
- Modify: `fheenv/package.json`

- [ ] **Step 1: Add opt-in integration scripts**

```json
{
  "scripts": {
    "test:cli:keyring-integration": "FHEENV_NATIVE_KEYRING_TEST=1 TS_NODE_PROJECT=cli/tsconfig.json mocha -r ts-node/register cli/test/native-keyring.integration.test.js",
    "test:cli:aws-kms-integration": "FHEENV_AWS_KMS_TEST=1 TS_NODE_PROJECT=cli/tsconfig.json mocha -r ts-node/register cli/test/aws-kms.integration.test.js"
  }
}
```

- [ ] **Step 2: Write the native round-trip test**

For a random UUID reference and random 32-byte value:

1. probe the native store;
2. set;
3. get and compare;
4. replace;
5. get and compare;
6. delete;
7. assert missing.

Cleanup runs in `finally`. The value must never be printed.

- [ ] **Step 3: Add the three-OS workflow**

Use:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [macos-latest, windows-latest, ubuntu-latest]
```

On Ubuntu, install and launch an isolated `dbus-daemon` plus
`gnome-keyring-daemon --components=secrets`. Install dependencies with the
frozen lockfile and run `test:cli:keyring-integration`.

- [ ] **Step 4: Add the protected AWS OIDC workflow**

Trigger only through `workflow_dispatch` and a protected `kms-integration`
environment. Grant:

```yaml
permissions:
  contents: read
  id-token: write
```

Use the official AWS credentials action with a repository variable containing
the role ARN. Pass only the test KMS key ARN and expected address as variables.
Run the live test against a zero-value Sepolia transaction that is signed and
verified but not broadcast.

- [ ] **Step 5: Run workflow lint and local tests**

Run:

```bash
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
CI=true pnpm run lint
CI=true pnpm run format:check
```

Expected: all local commands exit zero. The native and KMS integration scripts
must skip with a clear message unless their explicit environment flag is set.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/credential-stores.yml .github/workflows/aws-kms-signer.yml fheenv/package.json fheenv/cli/test/native-keyring.integration.test.js fheenv/cli/test/aws-kms.integration.test.js
git -c commit.gpgsign=false commit -m "ci: verify native stores and KMS signer"
```

---

### Task 12: Document Migration, Signing, and Compromise Recovery

**Files:**

- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `fheenv/README.md`
- Modify: `fheenv/.env.example`
- Modify: `fheenv/frontend/content/docs/cli/commands.mdx`
- Modify: `fheenv/frontend/content/docs/cli/ci-cd.mdx`
- Modify: `fheenv/frontend/content/docs/architecture/security-model.mdx`
- Modify: `fheenv/frontend/content/docs/architecture/smart-contract.mdx`
- Create: `docs/runbooks/credential-compromise.md`
- Create: `docs/runbooks/signer-rotation.md`

- [ ] **Step 1: Correct stale security documentation**

Remove claims that:

- the wallet file is plaintext;
- `removeOwner` is unavailable;
- `.fheenv.json` contains or should contain a Pinata JWT;
- raw private keys are the recommended automation path.

- [ ] **Step 2: Document every supported signer**

For WalletConnect, Ledger, AWS KMS, external, and development-local modes,
document:

- setup;
- supported operations;
- trust boundary;
- expected prompts;
- failure recovery;
- how to verify the selected address;
- how to disconnect or disable it.

- [ ] **Step 3: Document cross-platform credential stores**

Include:

- macOS Keychain requirements;
- Windows Credential Manager requirements;
- Linux Secret Service, D-Bus, GNOME Keyring, and KWallet requirements;
- explicit failure behavior on headless Linux;
- environment and executable-provider references;
- migration and dry-run examples.

- [ ] **Step 4: Write compromise runbooks**

`credential-compromise.md` covers Pinata, RPC, WalletConnect project/session,
and external provider credentials.

`signer-rotation.md` covers Ledger loss, KMS disable/replace, Safe owner
replacement, project co-owner removal, key funding, validation, and audit
evidence.

Each procedure has:

```text
Detection → Containment → Rotation → Authorization update
→ Validation → Revocation → Evidence capture
```

- [ ] **Step 5: Run docs and full repository verification**

Run:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm run format:check
CI=true pnpm run lint
CI=true pnpm run test
CI=true pnpm run test:cli
CI=true pnpm --filter fheenv build
CI=true pnpm --filter frontend lint
CI=true pnpm --filter frontend exec fumadocs-mdx
CI=true pnpm --filter frontend exec tsc --noEmit
CI=true NEXT_PUBLIC_REGISTRY_ADDRESS=0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2 NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK=0 NEXT_PUBLIC_CHAIN_ID=11155111 NEXT_PUBLIC_SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com PINATA_JWT=ci-placeholder pnpm --filter frontend build
```

Expected: every command exits zero with 58 or more contract tests, all CLI
tests passing, no lint warnings, and a successful frontend production build.

- [ ] **Step 6: Run prohibited-secret searches**

Run:

```bash
rg --hidden -n "pinataJwt|--pinata-jwt|FHEENV_PRIVATE_KEY|wc:.*symKey|privateKey" .github README.md SECURITY.md docs fheenv --glob '!fheenv/node_modules/**' --glob '!fheenv/frontend/.next/**'
```

Expected:

- no project-config credential field;
- no CLI private-key argument;
- `FHEENV_PRIVATE_KEY` appears only in migration/development warnings and
  negative tests;
- WalletConnect pairing material appears only as redacted test fixtures;
- private-key text appears only in explicit security boundaries and tests.

- [ ] **Step 7: Commit**

```bash
git add README.md SECURITY.md docs/runbooks fheenv/README.md fheenv/.env.example fheenv/frontend/content/docs
git -c commit.gpgsign=false commit -m "docs: explain secure credential and signer workflows"
```

---

### Task 13: Final Review and Issue #34 Evidence

**Files:**

- Modify only files required by findings from this review.

- [ ] **Step 1: Verify the feature branch is focused**

Run:

```bash
git status --short
git diff --check dev...HEAD
git diff --stat dev...HEAD
git log --oneline dev..HEAD
```

Expected: clean worktree, no whitespace errors, and only issue #34 scope.

- [ ] **Step 2: Verify configuration safety with a generated project**

Create a temporary project fixture through the CLI, configure each signer
type, and scan `.fheenv.json` for every injected canary secret.

Expected: no canary value, credential field, pairing URI, or raw private key is
present.

- [ ] **Step 3: Verify signer coverage**

Produce a test report showing:

- WalletConnect transaction plus EIP-712 request;
- Ledger transaction plus EIP-712 request;
- AWS KMS transaction, message, and EIP-712 signature;
- external signer response validation;
- encrypted-local rejection in production;
- all provider cancellation and wrong-account paths.

- [ ] **Step 4: Review issue #34 acceptance criteria line by line**

Map each criterion to:

- implementation file;
- automated test;
- CI job;
- operator documentation.

Do not close the issue if the live native-store matrix or protected AWS KMS
integration has not passed.

- [ ] **Step 5: Request code review**

Use the requesting-code-review workflow against `dev...HEAD`. Resolve every
critical and important finding, then rerun the complete verification suite.

- [ ] **Step 6: Prepare handoff**

Keep the feature branch unmerged until the user reviews the final diff and the
GitHub integration workflows are green.
