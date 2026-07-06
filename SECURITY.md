# Security Policy

## Reporting a Vulnerability

fheENV handles cryptographic secrets — we take security seriously.

If you discover a security vulnerability, **please do NOT open a public issue.**

Instead, report it privately:

1. **Email:** security@fheenv.dev (or kunalmanishshah@gmail.com until we set up the alias)
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
- Private keys are stored with `chmod 600` permissions
- Pinata JWT is server-side only (never exposed to browser)
- No plaintext secret ever touches any server or chain
