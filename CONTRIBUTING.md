# Contributing to fheENV

Thanks for your interest in contributing to fheENV! This guide will help you get started.

## Project Structure

```
fheenv/
├── contracts/          Solidity smart contract (fheENVRegistry.sol)
├── test/               Hardhat test suite
├── cli/                Node.js CLI tool (commander.js)
├── frontend/           Next.js web dashboard
├── scripts/            Deployment scripts
└── demo/               Demo walkthrough script
```

## Prerequisites

- **Node.js** >= 22
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Git**

## Setup

```bash
# Clone the repo
git clone https://github.com/Team-Managed/fheENV.git
cd fheENV/fheenv

# Install all dependencies (monorepo)
pnpm install

# Compile the smart contract
pnpm run compile

# Run tests
pnpm run test
```

### Frontend development

```bash
cd frontend
cp .env.example .env.local   # fill in your values
pnpm dev
```

### CLI development

```bash
cd cli
pnpm run build    # compile TypeScript
pnpm run dev      # run from source via ts-node
```

## Branching Model

We use a two-branch model:

```
feature/your-feature  ──►  dev  ──►  main
                    (PR)       (maintainer release)
```

- **`main`** — stable, production branch. Only `dev` can open a PR here. Maintainers merge `dev → main` periodically as releases.
- **`dev`** — integration branch. All contributor PRs must target `dev`.
- **Feature branches** — your working branch. Always created from `dev`.

> ⚠️ PRs targeting `main` directly from a feature branch will be automatically blocked by CI.

## Branch Naming

All branches **must** follow this pattern: `<type>/<short-description>`

| Type | Use for |
|------|---------|
| `feat/` | New features — `feat/add-remove-owner` |
| `fix/` | Bug fixes — `fix/cli-key-exposure` |
| `chore/` | Maintenance, deps, config — `chore/update-pnpm` |
| `docs/` | Documentation only — `docs/update-cli-usage` |
| `refactor/` | Code restructure, no behaviour change — `refactor/dashboard-fetching` |
| `ci/` | CI/CD pipeline changes — `ci/add-lint-step` |
| `test/` | Adding or updating tests — `test/contract-edge-cases` |
| `hotfix/` | Urgent production fix — `hotfix/rpc-timeout` |
| `release/` | Release preparation — `release/v1.1.0` |

Branch names that don't match this pattern will **fail CI** and cannot be merged.

## Making Changes

1. **Fork** the repository (external contributors) or create a branch (team members)
2. **Create a branch from `dev`**:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feat/my-feature
   ```
3. **Make your changes** — keep commits focused and atomic
4. **Test** your changes locally:
   - Smart contract changes: `pnpm run test`
   - CLI changes: `cd cli && pnpm run build`
   - Frontend changes: `cd frontend && npx tsc --noEmit`
5. **Push** and open a PR **targeting `dev`**

> One PR per concern. If your change touches contracts, CLI, and frontend independently, split it into separate PRs.

## CI Checks

Every PR must pass all of the following before it can be merged:

| Check | What it validates |
|-------|------------------|
| **Branch name check** | Branch follows `<type>/<description>` naming convention |
| **Only dev can target main** | PRs to `main` must come from the `dev` branch |
| **Lint & Format check** | Prettier formatting + ESLint rules pass |
| **Contracts (compile + test)** | Solidity compiles and all Hardhat tests pass |
| **CLI (typecheck + build)** | TypeScript compiles and CLI builds successfully |
| **Frontend (typecheck + build)** | TypeScript compiles and Next.js builds successfully |

## Pull Request Guidelines

- Target `dev`, never `main`
- Keep PRs focused on a single concern (one area: contract, CLI, or frontend)
- Update relevant documentation if behaviour changes
- Add tests for new smart contract functionality
- Ensure all CI checks pass before requesting review

## Commit Messages

We enforce [Conventional Commits](https://www.conventionalcommits.org/) via `commitlint`. Your commit message **must** match:

```
<type>: <short description>
```

Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `ci`, `test`, `hotfix`, `release`, `perf`, `style`, `build`, `revert`

```
feat: add environment deletion command
fix: handle empty .env file gracefully
docs: update CLI usage examples
chore: bump dependencies
```

A Husky `commit-msg` hook runs `commitlint` automatically — commits with non-conforming messages will be rejected locally before they even reach CI.

## Areas for Contribution

- **Smart contract improvements** — gas optimization, new access patterns
- **CLI commands** — new features, better error messages
- **Frontend UX** — responsive design, accessibility, new views
- **Documentation** — guides, examples, translations
- **Testing** — more edge cases, integration tests
- **Security** — audit findings, hardening

## Code of Conduct

Be respectful. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## License

By contributing, you agree that your contributions will be licensed under the project's [Elastic License 2.0](./LICENSE).

## Questions?

Open a [Discussion](https://github.com/Team-Managed/fheENV/discussions) or an issue tagged `question`.
