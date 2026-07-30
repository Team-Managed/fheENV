# Deployment manifests

Each non-local proxy deployment writes `deployments/<network>.json`. Review and commit that
manifest with the release so the frontend, CLI, audit indexer, and operators use the same proxy,
implementation, deployment block, chain, and upgrade-governance addresses.

Manifests must not contain private keys, RPC credentials, API tokens, Safe signatures, or other
secrets. A deployment is incomplete until its proxy and implementation bytecode are verified and
the manifest has been reviewed.
