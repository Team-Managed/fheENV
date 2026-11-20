# Security Policy

## Reporting a Vulnerability

fheENV handles cryptographic secrets — we take security seriously.

If you discover a security vulnerability, **please do NOT open a public issue.**

Instead, report it privately:

1. **Email:** security@fheenv.com
2. **GitHub:** Use [private vulnerability reporting](https://github.com/Team-Managed/fheENV/security/advisories/new)

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 7 days
- **Fix/Disclosure:** Coordinated with reporter

## Scope

| In Scope                                  | Out of Scope                               |
| ----------------------------------------- | ------------------------------------------ |
| Smart contract logic (fheENVRegistry.sol) | Third-party dependencies (report upstream) |
| CLI key handling & encryption             | Fhenix/CoFHE protocol itself               |
| Frontend secrets flow                     | Theoretical FHE attacks                    |
| IPFS upload/download integrity            | Social engineering                         |
| Access control bypass                     | Testnet-only issues with no mainnet impact |

## Supported Versions

| Version        | Supported   |
| -------------- | ----------- |
| Latest release | Yes         |
| Older releases | Best-effort |

## Security Design

- AES-256-GCM encryption happens **client-side only**
- AES keys are stored as FHE ciphertexts — server/operators cannot decrypt
- Production signing uses WalletConnect, Ledger, AWS KMS secp256k1, or a
  length-bounded external signer protocol
- Development-only local wallet files use scrypt plus AES-256-GCM and `chmod 600`
- Storage, RPC, and WalletConnect credentials are references resolved from
  macOS Keychain, Windows Credential Manager, Linux Secret Service, an
  explicit environment variable, or an external secret provider
- Project configuration contains no credential values
- Member removal rotates the environment key by default; `--no-rotate` is an explicit security exception
- Pinata JWT stays in the frontend server or the CLI's selected credential
  provider; it is never exposed to browser JavaScript or project config
- No plaintext secret ever touches any server or chain

## Current Production Boundary

fheENV is a production-grade pilot on supported CoFHE testnets. CoFHE mainnet
availability remains the deployment boundary, so the project is not
represented as mainnet-supported. Organization-managed signing is available
through AWS KMS and the external signer protocol. Production operators must
still configure multisig ownership, monitoring, backups, retention, and
incident response; fheENV is not itself an operating SOC 2 control.

The registry is UUPS upgradeable. The proxy owner can authorize implementation
changes and must be a Safe or equivalent multisig, preferably behind a
timelock. Project primary owners can remove co-owners; removing access does not
erase ciphertext or plaintext already copied by that party.

Local audit exports are operational diagnostics, not a durable compliance
ledger. Product analytics are separate from audit evidence.

## Product Analytics

CLI analytics are disabled by default and require an explicit
`fheenv init --analytics` or `fheenv analytics enable`. The CLI sends only a
random installation identifier, CLI version, operating-system family, command
success, and an optional coarse duration bucket. It does not send wallet
addresses, project IDs, environment names, CIDs, transaction hashes, command
arguments, file paths, error messages, or secret-derived values.

The frontend records anonymous page views only when
`NEXT_PUBLIC_POSTHOG_KEY` is configured. Autocapture, person profiles, surveys,
and session recording are disabled.
