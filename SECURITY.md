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
- New local wallet files use scrypt plus AES-256-GCM and `chmod 600`
- Member removal rotates the environment key by default; `--no-rotate` is an explicit security exception
- Pinata JWT is server-side only (never exposed to browser)
- No plaintext secret ever touches any server or chain

## Current Production Boundary

fheENV is a production-candidate pilot on supported CoFHE testnets. It is not
currently represented as mainnet-supported or as an operating SOC 2 control.
Unattended rotation and organization-managed signing remain blocked until an
external signer or workload identity replaces long-lived raw automation keys.

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
