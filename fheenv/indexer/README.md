# fheENV Ponder Indexer

Local & production event indexer for the `fheENVRegistry` smart contract on Ethereum Sepolia.

## Overview

This package indexes on-chain events (`ProjectCreated`, `EnvironmentUpdated`, `AccessGranted`, `AccessRevoked`, `OwnerAdded`) emitted by `fheENVRegistry`. At index time, it captures `event.transaction.from` as the actor, eliminating N+1 RPC calls, missed blocks, and webhook limits in the frontend.

## Quickstart

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env.local` and set your Sepolia RPC URL:

   ```bash
   cp .env.example .env.local
   ```

3. **Start local development indexer:**

   ```bash
   pnpm dev
   ```

   This will:
   - Sync Sepolia events starting from block 6,300,000.
   - Store events in a local SQLite database (`.ponder/`).
   - Serve a GraphQL playground and query endpoint at `http://localhost:42069`.

4. **Connect to Frontend:**
   In `fheenv/frontend/.env.local`, set:
   ```bash
   NEXT_PUBLIC_INDEXER_GRAPHQL_URL=http://localhost:42069
   ```

## Production Deployment

To run in production, supply `DATABASE_URL` pointing to any PostgreSQL instance (e.g. Supabase, Neon, Railway) and run:

```bash
pnpm start
```
