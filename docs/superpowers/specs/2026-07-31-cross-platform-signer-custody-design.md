# Cross-Platform Credential and Signer Custody Design

## Objective

Complete issue #34 by removing credentials from project configuration and
replacing raw-key-first CLI behavior with explicit signer providers.

The result must support:

- interactive software-wallet signing without exposing a private key;
- direct Ledger hardware-wallet signing;
- unattended signing with a non-exportable AWS KMS key and workload identity;
- macOS, Windows, and Linux native credential stores;
- a generic external-signer boundary for additional institutional providers;
- non-destructive migration from the current project config and wallet formats.

This work targets production-grade pilots on CoFHE-supported testnets. It does
not enable or claim mainnet support.

## Security Principles

1. fheENV must not request, receive, store, or log a raw private key in the
   normal interactive or headless production paths.
2. `.fheenv.json` must contain only non-secret project configuration and
   opaque credential references.
3. A missing or unavailable production credential or signer must fail closed.
4. Native keyring failures must never fall back silently to plaintext,
   command-line arguments, or an encrypted file.
5. Interactive signing must show the user what is being signed and require
   wallet or device approval.
6. Headless signing must use non-exportable key material and short-lived
   workload authorization.
7. Upgrade and ownership authority remains Safe- and timelock-controlled.
8. Secret values, WalletConnect pairing material, and provider responses must
   not enter logs, analytics, audit exports, diagnostics, or crash messages.

## Selected Architecture

### Command Context

All CLI commands that currently call `createClients()` will instead request a
`CommandContext`:

```ts
interface CommandContext {
  publicClient: PublicClient;
  signer: SignerSession;
  credentials: CredentialResolver;
}

interface SignerSession {
  type: "walletconnect" | "ledger" | "aws-kms" | "external" | "local-encrypted";
  address: Address;
  walletClient: WalletClient;
  capabilities: {
    transactions: true;
    messages: boolean;
    typedData: boolean;
  };
  close(): Promise<void>;
}
```

The `WalletClient` boundary is retained because the CoFHE SDK and existing
contract adapters already consume it. Each signer provider supplies a Viem
account or EIP-1193 transport appropriate to its custody model.

Commands must not inspect provider-specific secrets or branch on signer
implementation. They may check declared capabilities before beginning an
operation.

### Signer Configuration

Project configuration stores a non-secret signer selection:

```json
{
  "version": 2,
  "projectId": 1,
  "registryAddress": "0x...",
  "chainId": 11155111,
  "rpc": {
    "url": "https://ethereum-sepolia-rpc.publicnode.com"
  },
  "deployedAtBlock": 1234567,
  "securityMode": "production",
  "signer": {
    "type": "walletconnect",
    "credentialRef": "signer/default"
  },
  "storage": {
    "provider": "pinata",
    "credentialRef": "storage/pinata/default"
  }
}
```

Public RPC URLs may remain in the project file. URLs containing user
information or recognized credential query parameters must be moved to a
credential reference during migration.

`securityMode` has two values:

- `production`: rejects raw private-key environment variables, plaintext
  wallets, insecure keyring fallbacks, and missing external credentials;
- `development`: permits the existing encrypted local wallet and an explicit
  raw-key environment override with a prominent warning.

New projects default to `production`. Existing projects are migrated
explicitly and are not silently assigned a weaker mode.

## Interactive WalletConnect Signing

### Pairing

`walletconnect` is the default interactive signer.

1. The CLI initializes an EIP-1193 WalletConnect provider using a Reown project
   identifier resolved from the credential system.
2. The CLI renders the ephemeral `wc:` pairing URI as a terminal QR code.
3. The mobile wallet scans the QR and connects through the WalletConnect relay.
4. The CLI verifies that the approved chain and account match project
   requirements.
5. A random WalletConnect state-encryption key is stored in the native
   credential store. Session state and symmetric pairing material are stored
   only in a local AES-256-GCM encrypted file using that key.

The QR code contains pairing material, not a localhost URL and not transaction
data. The CLI and wallet communicate through outbound encrypted relay
connections, so the phone does not need network access to the laptop.

Pairing URIs must never be logged or emitted to telemetry. An unpaired URI
expires after a short bounded interval. Cancellation deletes incomplete
pairing state.

The encrypted state file uses atomic replacement and permissions `0600`.
Authenticated encryption binds the file to its schema version and installation
identifier. This envelope avoids native credential-size limits while keeping
the state unreadable without the OS-protected key. Missing keyring material
makes the session unrecoverable and causes a new pairing; it never triggers an
insecure fallback.

### Transaction Flow

For a contract write, the CLI:

1. constructs and simulates the unsigned transaction;
2. verifies chain ID, destination contract, function selector, value, and gas
   policy;
3. sends `eth_sendTransaction` through the WalletConnect session;
4. waits for the mobile or desktop wallet to approve and submit it;
5. receives the transaction hash through the encrypted session;
6. waits for a receipt and continues only after the expected result.

For CoFHE permits, the CLI sends the required EIP-712 request and receives only
the signature. It must verify the recovered signer address before using the
signature.

Wallet rejection, session expiry, wrong-chain approval, account switching, and
relay interruption are distinct non-zero errors. No operation may be reported
as successful until the chain receipt or required signature is verified.

### Same-Device Use

The CLI also prints a clickable WalletConnect link when the terminal supports
it. Desktop wallets can accept the link or pairing URI. A user without a
second device can instead select Ledger or the explicit development-only local
signer.

No local callback server is required for WalletConnect.

## Ledger Hardware Signing

The Ledger provider uses the official Ethereum Device Signer Kit and a
configurable derivation path. It supports:

- displaying and retrieving the selected Ethereum address;
- transaction signing;
- personal-message signing;
- EIP-712 typed-data signing.

Before every signature, the CLI displays the requested chain, account,
operation, destination, and value. The device remains the source of approval.
The derived address is verified against an optional expected address in
project configuration.

Device unavailable, Ethereum app closed, blind-signing requirement, user
rejection, wrong derivation path, and unsupported typed data are distinct
errors.

Ledger libraries and firmware requirements are pinned and documented. Trezor
uses the same signer interface but is outside this issue.

## Headless AWS KMS Signing

### Identity and Key Custody

The first production headless adapter uses an AWS KMS asymmetric
`ECC_SECG_P256K1` signing key.

- The private key is generated in and never exported from KMS.
- GitHub Actions authenticates to AWS through OIDC.
- Kubernetes or cloud workloads use their platform workload identity.
- The AWS SDK default credential chain supplies short-lived authorization.
- No AWS access key or Ethereum private key is stored by fheENV.

The project file stores only the KMS key ARN reference and expected Ethereum
address. The key policy restricts callers, environments, and signing actions.

### Ethereum Signature Adapter

The KMS adapter:

1. obtains and caches only the public key;
2. derives and verifies the Ethereum address;
3. hashes the exact Ethereum transaction, message, or typed data locally;
4. requests an ECDSA signature over the digest;
5. parses the DER signature;
6. normalizes `s` to Ethereum low-s form;
7. derives the recovery identifier against the configured public key;
8. verifies the completed signature locally;
9. serializes or broadcasts through the existing Viem client.

Nonce allocation, replacement, receipt polling, and retry behavior remain in
the command layer. A KMS retry must never sign a different payload under the
same operation identifier.

### Policy Boundary

KMS permission alone does not authorize arbitrary contract activity. The
adapter enforces a local policy before signing:

- allowed chain IDs;
- allowed destination contracts;
- allowed function selectors;
- zero native value by default;
- configurable gas and fee ceilings;
- expected signer address.

Organization policy and IAM remain the authoritative outer boundary. The
local policy prevents accidental misuse but is not represented as protection
against a fully compromised workload.

A live AWS integration workflow, authenticated by GitHub OIDC, must prove
public-key retrieval, address derivation, typed-data signing, transaction
signing, and signature verification before the adapter is considered
production-supported.

## Generic External Signer

An `external` provider supports institutional custody, MPC systems, and future
Azure/GCP/Vault adapters without changing command code.

The provider launches an explicitly configured executable without a shell and
communicates using length-bounded JSON over stdin/stdout:

```json
{
  "protocolVersion": 1,
  "requestId": "uuid",
  "operation": "signTypedData",
  "chainId": 11155111,
  "expectedAddress": "0x...",
  "payload": {}
}
```

The response contains the request ID, signer address, and signature or
transaction hash. stderr is treated as untrusted and is redacted before
display.

The executable path is absolute, must not be a project-relative executable in
production, and is invoked with a minimal environment allowlist. Arguments
must never contain transaction payloads or credentials. Timeouts, output-size
limits, protocol-version validation, signer recovery, and cancellation are
mandatory.

Azure Key Vault, Google Cloud KMS, Fireblocks, Turnkey, and similar providers
can implement this protocol initially and may later receive native adapters.

## Cross-Platform Credential Storage

### Native Store

The CLI uses a small `CredentialStore` interface:

```ts
interface CredentialStore {
  get(reference: CredentialRef): Promise<SecretValue | null>;
  set(reference: CredentialRef, value: SecretValue): Promise<void>;
  delete(reference: CredentialRef): Promise<void>;
  probe(): Promise<CredentialStoreStatus>;
}
```

The first implementation uses direct native bindings through
`@napi-rs/keyring`:

- macOS: Keychain Services;
- Windows: Windows Credential Manager;
- Linux desktop: Secret Service through libsecret, GNOME Keyring, or KWallet.

Shell-command keyring fallbacks are not allowed in production because secrets
can leak through arguments, subprocess errors, or platform-specific process
inspection. If the native binding or OS service is unavailable, production
mode fails with platform-specific setup guidance.

Credential keys use the service name `fheenv` and opaque generated account
identifiers. Project files contain only references such as
`storage/pinata/default`; they never contain the resolved value.

### Resolution Order

Credential resolution is explicit rather than an implicit fallback chain.
Each config reference specifies one source:

- `keyring://...` for desktop native stores;
- `env://VARIABLE_NAME` for intentionally injected headless credentials;
- `exec://provider-name/key` for the generic secret-provider protocol.

Production mode permits environment references for provider tokens, but never
for an Ethereum private key. Missing values fail before any chain or upload
operation starts.

The CLI must not enumerate environment variables or keyring entries in
diagnostics.

### Management Commands

Credentials are managed through:

```text
fheenv credentials set storage/pinata/default
fheenv credentials status
fheenv credentials delete storage/pinata/default
fheenv signer configure walletconnect
fheenv signer configure ledger
fheenv signer configure aws-kms
fheenv signer status
```

Secret input is non-echoing on a TTY and read from stdin only when explicitly
requested. Secret values are never accepted as command arguments.

## Project Configuration Migration

`fheenv migrate credentials` performs a non-destructive, fail-closed migration:

1. Parse and validate the existing config without printing it.
2. Detect `pinataJwt` and credential-bearing RPC URLs.
3. Ask for or select the destination credential source.
4. Write each secret to the destination.
5. Read it back and compare in constant time.
6. Build a version-2 config containing only references.
7. Write and fsync a temporary config.
8. Atomically replace `.fheenv.json`.
9. Rescan the resulting file for known secret values.

The original file is not modified until every secret is stored and verified.
If any step fails, the original remains unchanged. Once the atomic replacement
succeeds, credential values remain recoverable from the selected provider.

`--dry-run` reports only field names and intended destinations. It never
prints values.

Legacy plaintext wallets continue to require the existing explicit
`fheenv login --migrate` flow. Production mode refuses them. The encrypted
local wallet remains available only with `securityMode: development`.

## Redaction and Error Handling

A central sensitive-value registry records every secret resolved during the
process. All user-visible provider errors pass through a redactor that:

- replaces exact known secret values;
- removes URL user information and known credential query parameters;
- removes WalletConnect pairing URIs and symmetric keys;
- limits nested provider errors and response bodies;
- prevents environment and configuration dumps.

Analytics remains allowlist-only and receives no raw error messages.
Operational audit records contain action, status, project/environment
identifiers, versions, and transaction hashes where appropriate, but no
credentials, signature requests, pairing data, or provider responses.

Crash handlers must emit a sanitized message and stable error code. Debug mode
does not disable redaction.

## Administrative Governance

Signer custody and authorization are separate concerns.

- Routine pilot transactions may use an explicitly authorized wallet,
  hardware device, or KMS-backed project owner.
- Proxy upgrades and high-risk administrative actions remain controlled by a
  Safe and timelock.
- CI may prepare or propose an administrative transaction but must not be able
  to satisfy the Safe threshold alone.
- This issue does not add a broad on-chain Rotator role or unattended
  scheduled rotation.

Safe proposal automation and scoped workload consumption continue under issue
#36.

## Testing Strategy

### Unit and Contract Tests

- Every signer provider passes a shared capability contract.
- Wrong-chain, wrong-account, rejected-signature, malformed-signature, timeout,
  and cancellation paths fail non-zero.
- KMS DER parsing, low-s normalization, recovery ID derivation, and signer
  verification use deterministic vectors.
- External-provider framing, timeouts, environment allowlisting, and output
  limits are tested.
- Credential resolution never falls through to an undeclared source.
- Migration interruption at every step leaves either the original valid
  config or the complete version-2 config.
- Redaction tests inject canary secrets into provider errors, URLs, telemetry,
  audits, and diagnostics and assert that no canary survives.

### Cross-Platform CI Matrix

Native credential integration tests run on:

- `macos-latest` against a temporary Keychain entry;
- `windows-latest` against a temporary Credential Manager entry;
- `ubuntu-latest` with an isolated D-Bus Secret Service;

Each test creates a random value, writes it, reads it, replaces it, deletes it,
and verifies absence. Cleanup runs even after failure.

### Interactive Integration

WalletConnect tests use:

- a protocol-level test wallet for deterministic CI;
- manual release qualification with at least two supported mobile wallets;
- wrong-chain, account-switch, rejection, expiry, reconnect, and relay-loss
  scenarios.

Ledger tests use:

- mocked transport and deterministic signing vectors in CI;
- an opt-in hardware qualification job before release;
- transaction, message, and EIP-712 signing on each supported testnet.

### Headless Integration

AWS tests use:

- deterministic mocked KMS responses for the normal CI suite;
- a protected live workflow using GitHub OIDC and a dedicated test KMS key;
- a policy that permits only the repository, protected branch/environment,
  test chain, and dedicated key.

No production signer adapter is marked supported until its live integration
workflow passes.

## Rollout and Compatibility

1. Release version-2 config parsing and migration commands.
2. Keep version-1 configs readable only to produce migration guidance.
3. Release native credential-store support on all three desktop OS families.
4. Release WalletConnect and Ledger interactive signers.
5. Release AWS KMS behind an explicit production feature flag until its live
   integration workflow passes.
6. Enable AWS KMS as a supported production signer after qualification.
7. Deprecate raw private-key environment use with a removal date; it remains
   development-only during the migration window.

Commands must not silently rewrite configuration or change signer selection.

## Credential Compromise and Rotation

Documentation must define separate procedures for:

- Pinata token compromise and replacement;
- credential-bearing RPC endpoint rotation;
- WalletConnect project or session compromise;
- Ledger loss and Safe owner replacement;
- AWS KMS key disablement, replacement, address authorization, and funding;
- external-provider credential or endpoint compromise;
- local encrypted-wallet compromise and project access revocation.

Each runbook includes containment, rotation, validation, audit evidence, and
revocation steps. Testnet funds and permissions are treated as disposable and
not portable to a future mainnet deployment.

## Explicit Exclusions

- Mainnet deployment or support.
- Trezor integration.
- Native Azure Key Vault and Google Cloud KMS adapters.
- Vendor-specific Fireblocks, Turnkey, Privy, or Vault SDK integrations.
- Scheduled unattended rotation.
- A new broad on-chain automation role.
- Replacing Safe/timelock governance.
- Durable centralized audit retention and alerting, which remain in issue #38.

## Acceptance Mapping

- Credential-free `.fheenv.json`: version-2 schema and atomic migration.
- Non-destructive config and wallet migration: verified provider write before
  atomic replacement; explicit legacy-wallet migration.
- Non-echoing interactive input: credential-management commands and existing
  wallet prompt.
- Production fail-closed behavior: explicit security mode and source
  selection.
- OS-backed local stores: macOS, Windows, and Linux native integration matrix.
- External signer: WalletConnect, Ledger, AWS KMS, and generic executable
  protocol.
- Redaction proof: canary-based unit and integration tests.
- Rotation procedures: provider-specific compromise runbooks.

## References

- WalletConnect EVM RPC:
  https://docs.walletconnect.network/wallet-sdk/chain-support/evm
- Reown EIP-1193 Ethereum provider:
  https://docs.reown.com/advanced/providers/ethereum
- Ledger Ethereum Signer Kit:
  https://developers.ledger.com/docs/device-interaction/references/signers/eth
- AWS KMS secp256k1 key specification:
  https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html
- GitHub Actions OIDC:
  https://docs.github.com/en/actions/concepts/security/openid-connect
- Safe transaction proposal and confirmation:
  https://docs.safe.global/core-api/transaction-service-guides/transactions
