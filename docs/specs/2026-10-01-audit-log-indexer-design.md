# Audit Log Indexer Design Spec (Ponder)

**Date:** 2026-10-01  
**Status:** In Review  
**Target:** Eliminate audit log block scanning drops and webhook quota exhaustion via Ponder with graceful client-side fallback.

---

## 1. Problem & Context

In `fheenv/frontend/components/AuditLog.tsx`, audit evidence for projects is currently fetched via public Blockscout REST endpoints (`/addresses/${REGISTRY_ADDRESS}/logs`) and direct client-side block scanning. Under active conditions, this causes three critical issues:
1. **Missed Blocks & Incomplete Logs:** Public explorer and RPC `eth_getLogs` block range limits cause older or busy blocks to be skipped.
2. **Webhook Quotas:** Webhooks (Alchemy/QuickNode/etc.) hit execution limits and rate caps, resulting in lost events.
3. **N+1 HTTP Lookups:** After fetching logs, `AuditLog.tsx` runs individual HTTP requests (`fetchTransactionActor`) for each log in `Promise.all` to resolve `tx.from`, triggering `429` rate-limit errors on the frontend.

---

## 2. Architecture & Data Flow

```
[ Sepolia Chain (RPC / WebSockets) ]
       │
       ▼ (eth_getLogs with block range chunking & caching)
[ Ponder Indexer (`fheenv/indexer`) ]
  - Listens to fheENVRegistry (0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2)
  - Processes 5 events:
      * ProjectCreated
      * EnvironmentUpdated
      * AccessGranted
      * AccessRevoked
      * OwnerAdded
  - Captures `event.transaction.from` as `actor` at index time
  - Stores into local SQLite (development) or PostgreSQL (production)
  - Serves GraphQL API at http://localhost:42069 (or configured PORT)
       │
       │ (1 query: auditEvents(where: { projectId: $projectId }))
       ▼
[ Next.js Frontend (`fheenv/frontend`) ]
  - Checks NEXT_PUBLIC_INDEXER_GRAPHQL_URL
  - Queries Ponder GraphQL endpoint for instant, pre-sorted audit trail
  - If endpoint is unset or errors: gracefully falls back to Blockscout REST API
```

---

## 3. Package Specification: `fheenv/indexer`

A new workspace package `fheenv/indexer` will be added to the pnpm monorepo.

### 3.1 `pnpm-workspace.yaml`
Add `"indexer"` to the monorepo workspace packages:
```yaml
packages:
  - "frontend"
  - "cli"
  - "indexer"
```

### 3.2 Directory Layout
```
fheenv/indexer/
├── abis/
│   └── RegistryAbi.ts
├── src/
│   └── index.ts
├── ponder.config.ts
├── ponder.schema.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 3.3 Database Schema (`ponder.schema.ts`)
Using Ponder's `onchainTable` definition:
```typescript
import { onchainTable } from "ponder";

export const auditEvent = onchainTable("audit_event", (t) => ({
  id: t.text().primaryKey(), // `${transactionHash}-${logIndex}`
  projectId: t.bigint().notNull(),
  eventType: t.text().notNull(), // 'project_created' | 'rotation' | 'access_granted' | 'access_revoked' | 'owner_added'
  eventName: t.text().notNull(), // 'ProjectCreated' | 'EnvironmentUpdated' | 'AccessGranted' | 'AccessRevoked' | 'OwnerAdded'
  actor: t.text().notNull(), // event.transaction.from
  target: t.text(), // member or newOwner
  environment: t.text(), // envHash
  newCid: t.text(), // blobCid
  version: t.bigint(), // environment version
  blockNumber: t.integer().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.text().notNull(),
  logIndex: t.integer().notNull(),
}));
```

### 3.4 Ponder Config (`ponder.config.ts`)
```typescript
import { createConfig } from "ponder";
import { http } from "viem";
import { REGISTRY_ABI } from "./abis/RegistryAbi";

export default createConfig({
  networks: {
    sepolia: {
      chainId: 11155111,
      transport: http(process.env.PONDER_RPC_URL_11155111 || "https://rpc.sepolia.org"),
    },
  },
  contracts: {
    fheENVRegistry: {
      network: "sepolia",
      abi: REGISTRY_ABI,
      address: "0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2",
      startBlock: 6300000,
    },
  },
});
```

### 3.5 Event Handlers (`src/index.ts`)
Ponder event handlers listen to all 5 events, directly record `event.transaction.from` as `actor`, and insert into the `auditEvent` table:
- `fheENVRegistry:ProjectCreated` → inserts `eventType: "project_created"`
- `fheENVRegistry:EnvironmentUpdated` → inserts `eventType: "rotation"`, `newCid: blobCid`, `version`
- `fheENVRegistry:AccessGranted` → inserts `eventType: "access_granted"`, `target: member`, `environment: envHash`
- `fheENVRegistry:AccessRevoked` → inserts `eventType: "access_revoked"`, `target: member`, `environment: envHash`
- `fheENVRegistry:OwnerAdded` → inserts `eventType: "owner_added"`, `target: newOwner`

---

## 4. Frontend Integration (`fheenv/frontend`)

### 4.1 Indexer Client Utility (`lib/indexer.ts`)
- Implements `fetchAuditEventsFromIndexer(projectId: bigint, signal?: AbortSignal)`.
- Queries Ponder's GraphQL API:
  ```graphql
  query GetAuditEvents($projectId: BigInt!) {
    auditEvents(
      where: { projectId: $projectId }
      orderBy: "blockNumber"
      orderDirection: "desc"
    ) {
      items {
        id
        projectId
        eventName
        eventType
        actor
        target
        environment
        newCid
        version
        blockNumber
        blockTimestamp
        transactionHash
        logIndex
      }
    }
  }
  ```
- Transforms items directly into `AuditEntry` objects.

### 4.2 Updated `AuditLog.tsx`
- First checks if `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` is set.
- If set, executes `fetchAuditEventsFromIndexer`.
- If unset or on fetch error, logs a clean debug note and falls back seamlessly to the existing Blockscout REST routine.
- CSV export remains 100% identical in column headers, types, and values.

### 4.3 Environment Variable Configuration
- Add `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` to `fheenv/frontend/.env.example`:
  ```bash
  # Optional: Ponder GraphQL Indexer endpoint (e.g. http://localhost:42069 or hosted URL)
  # If omitted, frontend falls back to Blockscout logs API.
  NEXT_PUBLIC_INDEXER_GRAPHQL_URL=http://localhost:42069
  ```

---

## 5. Error Handling & Edge Cases

| Scenario | Behavior |
| --- | --- |
| `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` is empty | Falls back directly to Blockscout REST API without errors |
| Ponder indexer is syncing or offline | Catches query error, falls back to Blockscout |
| Brand-new project with 0 events | Returns empty array `[]` cleanly |
| Chain reorganizations | Automatically handled by Ponder's internal reorg engine |
| Block timestamp normalization | Ponder BigInt timestamp converted to ISO string for `<time>` display |

---

## 6. Verification & Acceptance Testing

1. **Indexer Compilation & Codegen:**
   - Run `pnpm --filter indexer build` / `pnpm --filter indexer ponder codegen` to ensure zero type errors.
2. **Local Sync Verification:**
   - Launch `pnpm --filter indexer dev` and verify that Ponder discovers the `fheENVRegistry` contract on Sepolia, indexes past events into SQLite, and serves the GraphQL playground.
3. **Frontend Integration & Fallback:**
   - Run Next.js frontend with `NEXT_PUBLIC_INDEXER_GRAPHQL_URL=http://localhost:42069`: verify audit trail loads instantly with zero N+1 calls.
   - Run Next.js frontend with `NEXT_PUBLIC_INDEXER_GRAPHQL_URL=""`: verify fallback to Blockscout works without throwing errors.
   - Verify CSV export matches expected headers and format.
