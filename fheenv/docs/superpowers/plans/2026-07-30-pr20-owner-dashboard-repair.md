# PR #20 Owner Dashboard Repair Plan

**Goal:** Merge the owner-management CLI/UI and replace dashboard-wide project polling with bounded, event-derived ownership that remains correct after removals and transfers.

## 1. Reconcile with current `dev`

- Merge `origin/dev` into the PR branch without rewriting contributor history.
- Resolve the dashboard, TeamManager, ABI, CLI registration, and lockfile against the hardened current code.
- Preserve PR #19's primary-owner-only contract semantics.

## 2. Specify ownership reconstruction

- Add failing unit tests for:
  - projects created by the connected wallet;
  - co-owner additions;
  - removal after creation or addition;
  - removal followed by re-addition;
  - deterministic project ordering and metadata from creation events.
- Implement a small pure reducer that chronologically applies creation, addition, and removal events.

## 3. Repair dashboard discovery

- Query bounded `ProjectCreated`, `OwnerAdded`, and `OwnerRemoved` logs.
- Use creation logs as project metadata, eliminating `projects(projectId)` reads.
- Apply ownership events in block/log order, eliminating stale access after removal or transfer.
- Refetch naturally on wallet/account/client changes.
- Require and validate a non-negative deployment block instead of silently scanning from genesis.

## 4. Repair owner removal surfaces

- Keep the CLI command consistent with existing command/error conventions.
- Validate addresses with `viem` rather than prefix-only checks.
- Keep the UI operation explicit, primary-owner-labelled, transaction-confirmed, and protected by a confirmation step.
- Ensure ABI bindings match the merged contract.

## 5. Validate and merge

- Run formatting, lint, root/CLI/frontend type checks, contract and reducer tests, CLI build, MDX generation, and frontend production build.
- Push to the existing PR branch, update the PR description, clear the stale review only after evidence passes, wait for GitHub/Vercel checks, and merge into `dev`.
- Fast-forward the local `dev` checkout to the resulting remote merge commit.
