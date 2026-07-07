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

## Making Changes

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/my-feature`
3. **Make your changes** — keep commits focused and atomic
4. **Test** your changes:
   - Smart contract changes: `pnpm run test`
   - CLI changes: `cd cli && pnpm run build`
   - Frontend changes: `cd frontend && npx tsc --noEmit`
5. **Push** to your fork and open a **Pull Request**

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Update relevant documentation if behavior changes
- Add tests for new functionality
- Ensure TypeScript compiles without errors
- Follow existing code style (no linter configured yet — match surrounding code)

## Commit Messages

Use conventional commits:

```
feat: add environment deletion command
fix: handle empty .env file gracefully
docs: update CLI usage examples
chore: bump dependencies
```

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
