# Audit Log Ponder Indexer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate audit log block scanning drops, RPC range errors, and webhook quota limits by introducing a Ponder indexer package (`fheenv/indexer`) in the monorepo and integrating it into `AuditLog.tsx` with resilient fallback.

**Architecture:** A lightweight Ponder service (`fheenv/indexer`) indexes all 5 `fheENVRegistry` events on Sepolia into SQLite/PostgreSQL, extracting `event.transaction.from` as `actor` at index time. The Next.js frontend queries this GraphQL API in a single query when `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` is provided, and gracefully falls back to the existing Blockscout REST logic if the indexer is unset or unreachable.

**Tech Stack:** Ponder (`@ponder/core`), Viem (`viem`), TypeScript, Next.js 16, React 19, pnpm workspace.

## Global Constraints
- Target contract: `fheENVRegistry` at `0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2` on Sepolia (Chain ID `11155111`).
- Events indexed: `ProjectCreated`, `EnvironmentUpdated`, `AccessGranted`, `AccessRevoked`, `OwnerAdded`.
- Zero broken functionality: if `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` is not set or the indexer is offline, `AuditLog.tsx` must continue to function via the existing Blockscout API without crashing.
- CSV export parity: CSV column headers and formats must remain 100% identical.
- No unapproved `@ts-ignore`, `as any`, or suppression comments.

---

### Task 1: Package Scaffolding & ABI Definition (`fheenv/indexer`)

**Files:**
- Modify: `fheenv/pnpm-workspace.yaml:1-5`
- Create: `fheenv/indexer/package.json`
- Create: `fheenv/indexer/tsconfig.json`
- Create: `fheenv/indexer/.env.example`
- Create: `fheenv/indexer/abis/RegistryAbi.ts`

**Interfaces:**
- Produces: `REGISTRY_ABI` in `fheenv/indexer/abis/RegistryAbi.ts` (Viem typed ABI including the 5 events) for Ponder contract binding.

- [ ] **Step 1: Update `pnpm-workspace.yaml` to include indexer**
```yaml
packages:
  - "frontend"
  - "cli"
  - "indexer"
```

- [ ] **Step 2: Create `fheenv/indexer/package.json`**
```json
{
  "name": "indexer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "ponder dev",
    "start": "ponder start",
    "codegen": "ponder codegen",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@ponder/core": "^0.8.21",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 3: Create `fheenv/indexer/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "ponder.config.ts", "ponder.schema.ts", "abis"]
}
```

- [ ] **Step 4: Create `fheenv/indexer/.env.example`**
```bash
# Sepolia RPC URL for Ponder indexing
PONDER_RPC_URL_11155111=https://eth-sepolia.g.alchemy.com/v2/your-api-key

# Optional: PostgreSQL connection URL (defaults to SQLite in development)
# DATABASE_URL=postgresql://user:password@localhost:5432/fheenv_indexer

# Port for Ponder GraphQL server
PORT=42069
```

- [ ] **Step 5: Create `fheenv/indexer/abis/RegistryAbi.ts`**
```typescript
import { parseAbi } from "viem";

export const REGISTRY_ABI = parseAbi([
  "event ProjectCreated(uint256 indexed projectId, address indexed owner, string name)",
  "event EnvironmentUpdated(uint256 indexed projectId, bytes32 indexed envHash, string blobCid, uint256 version)",
  "event AccessGranted(uint256 indexed projectId, bytes32 indexed envHash, address indexed member)",
  "event AccessRevoked(uint256 indexed projectId, bytes32 indexed envHash, address indexed member)",
  "event OwnerAdded(uint256 indexed projectId, address indexed newOwner)",
]);
```

- [ ] **Step 6: Install dependencies in monorepo**
Run: `pnpm install` from `fheenv/` root.

---

### Task 2: Ponder Schema, Config, and Event Handlers

**Files:**
- Create: `fheenv/indexer/ponder.schema.ts`
- Create: `fheenv/indexer/ponder.config.ts`
- Create: `fheenv/indexer/src/index.ts`
- Create: `fheenv/indexer/README.md`

**Interfaces:**
- Consumes: `REGISTRY_ABI` from `fheenv/indexer/abis/RegistryAbi.ts`
- Produces: `auditEvent` onchain table and handlers indexing 5 events into the GraphQL API.

- [ ] **Step 1: Create `fheenv/indexer/ponder.schema.ts`**
```typescript
import { onchainTable } from "ponder";

export const auditEvent = onchainTable("audit_event", (t) => ({
  id: t.text().primaryKey(),
  projectId: t.bigint().notNull(),
  eventType: t.text().notNull(),
  eventName: t.text().notNull(),
  actor: t.text().notNull(),
  target: t.text(),
  environment: t.text(),
  newCid: t.text(),
  version: t.bigint(),
  blockNumber: t.integer().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.text().notNull(),
  logIndex: t.integer().notNull(),
}));
```

- [ ] **Step 2: Create `fheenv/indexer/ponder.config.ts`**
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

- [ ] **Step 3: Create `fheenv/indexer/src/index.ts`**
```typescript
import { ponder } from "ponder:registry";
import { auditEvent } from "../ponder.schema";

ponder.on("fheENVRegistry:ProjectCreated", async ({ event, context }) => {
  await context.db.insert(auditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    projectId: event.args.projectId,
    eventType: "project_created",
    eventName: "ProjectCreated",
    actor: event.transaction.from,
    target: event.args.owner,
    environment: null,
    newCid: null,
    version: null,
    blockNumber: Number(event.block.number),
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("fheENVRegistry:EnvironmentUpdated", async ({ event, context }) => {
  await context.db.insert(auditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    projectId: event.args.projectId,
    eventType: "rotation",
    eventName: "EnvironmentUpdated",
    actor: event.transaction.from,
    target: null,
    environment: event.args.envHash,
    newCid: event.args.blobCid,
    version: event.args.version,
    blockNumber: Number(event.block.number),
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("fheENVRegistry:AccessGranted", async ({ event, context }) => {
  await context.db.insert(auditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    projectId: event.args.projectId,
    eventType: "access_granted",
    eventName: "AccessGranted",
    actor: event.transaction.from,
    target: event.args.member,
    environment: event.args.envHash,
    newCid: null,
    version: null,
    blockNumber: Number(event.block.number),
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("fheENVRegistry:AccessRevoked", async ({ event, context }) => {
  await context.db.insert(auditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    projectId: event.args.projectId,
    eventType: "access_revoked",
    eventName: "AccessRevoked",
    actor: event.transaction.from,
    target: event.args.member,
    environment: event.args.envHash,
    newCid: null,
    version: null,
    blockNumber: Number(event.block.number),
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});

ponder.on("fheENVRegistry:OwnerAdded", async ({ event, context }) => {
  await context.db.insert(auditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    projectId: event.args.projectId,
    eventType: "owner_added",
    eventName: "OwnerAdded",
    actor: event.transaction.from,
    target: event.args.newOwner,
    environment: null,
    newCid: null,
    version: null,
    blockNumber: Number(event.block.number),
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });
});
```

- [ ] **Step 4: Create `fheenv/indexer/README.md` documenting usage**
Include setup commands:
```bash
pnpm --filter indexer dev
```

- [ ] **Step 5: Verify typecheck and compilation**
Run: `pnpm --filter indexer type-check` or `pnpm --filter indexer codegen` to confirm everything is well-formed.

---

### Task 3: Frontend Indexer Query Client (`fheenv/frontend/lib/indexer.ts`)

**Files:**
- Create: `fheenv/frontend/lib/indexer.ts`
- Modify: `fheenv/frontend/.env.example`

**Interfaces:**
- Produces: `fetchAuditEventsFromIndexer(projectId: bigint, signal?: AbortSignal): Promise<AuditEntry[]>`
- Transforms GraphQL query response directly into UI-compatible `AuditEntry[]` format.

- [ ] **Step 1: Write `fheenv/frontend/lib/indexer.ts`**
```typescript
import type { Hex } from "viem";

export type EventName =
  | "ProjectCreated"
  | "EnvironmentUpdated"
  | "AccessGranted"
  | "AccessRevoked"
  | "OwnerAdded";

export interface AuditEntry {
  eventName: EventName;
  label: string;
  color: string;
  dot: string;
  blockNumber: number;
  timestamp: string;
  transactionHash: Hex;
  logIndex: number;
  actor: string;
  target: string;
  environment: string;
  newCid: string;
  version: string;
  expiresAt: string;
}

const EVENT_STYLES: Record<EventName, { label: string; color: string; dot: string }> = {
  ProjectCreated: { label: "Project Created", color: "text-brand-blue", dot: "bg-brand-blue" },
  EnvironmentUpdated: {
    label: "Key Rotated",
    color: "text-indigo-400",
    dot: "bg-indigo-400",
  },
  AccessGranted: { label: "Access Granted", color: "text-green-400", dot: "bg-green-400" },
  AccessRevoked: { label: "Access Revoked", color: "text-red-400", dot: "bg-red-400" },
  OwnerAdded: { label: "Owner Added", color: "text-cyan-400", dot: "bg-cyan-400" },
};

interface PonderAuditEventItem {
  id: string;
  projectId: string;
  eventName: string;
  eventType: string;
  actor: string;
  target: string | null;
  environment: string | null;
  newCid: string | null;
  version: string | null;
  blockNumber: number;
  blockTimestamp: string;
  transactionHash: string;
  logIndex: number;
}

interface PonderGraphQLResponse {
  data?: {
    auditEvents?: {
      items?: PonderAuditEventItem[];
    };
  };
  errors?: Array<{ message: string }>;
}

const AUDIT_QUERY = `
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
`;

export async function fetchAuditEventsFromIndexer(
  projectId: bigint,
  endpointUrl: string,
  signal?: AbortSignal,
): Promise<AuditEntry[]> {
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: AUDIT_QUERY,
      variables: {
        projectId: projectId.toString(),
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Indexer returned HTTP status ${response.status}`);
  }

  const json = (await response.json()) as PonderGraphQLResponse;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Indexer GraphQL error: ${json.errors[0].message}`);
  }

  const items = json.data?.auditEvents?.items ?? [];

  return items
    .filter((item): item is PonderAuditEventItem & { eventName: EventName } => {
      return item.eventName in EVENT_STYLES;
    })
    .map((item) => {
      const eventName = item.eventName as EventName;
      const tsNum = Number(item.blockTimestamp);
      const isoTimestamp = !Number.isNaN(tsNum) && tsNum > 0
        ? new Date(tsNum * 1000).toISOString()
        : new Date().toISOString();

      return {
        eventName,
        ...EVENT_STYLES[eventName],
        blockNumber: item.blockNumber,
        timestamp: isoTimestamp,
        transactionHash: item.transactionHash as Hex,
        logIndex: item.logIndex,
        actor: item.actor,
        target: item.target ?? "",
        environment: item.environment ?? "",
        newCid: item.newCid ?? "",
        version: item.version ? item.version.toString() : "",
        expiresAt: "",
      };
    })
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}
```

- [ ] **Step 2: Update `fheenv/frontend/.env.example`**
Add:
```bash
# Optional: Ponder GraphQL Indexer endpoint (e.g. http://localhost:42069 or hosted URL)
# If omitted or offline, frontend gracefully falls back to Blockscout.
NEXT_PUBLIC_INDEXER_GRAPHQL_URL=http://localhost:42069
```

---

### Task 4: Integrate Hybrid Fallback into `AuditLog.tsx`

**Files:**
- Modify: `fheenv/frontend/components/AuditLog.tsx:1-215`

**Interfaces:**
- Consumes: `fetchAuditEventsFromIndexer` from `fheenv/frontend/lib/indexer.ts`
- Retains existing `AuditLog` props (`{ projectId: bigint }`) and CSV export format.

- [ ] **Step 1: Update `fheenv/frontend/components/AuditLog.tsx`**
Import `fetchAuditEventsFromIndexer`:
```typescript
import { fetchAuditEventsFromIndexer } from "@/lib/indexer";
```
In `useEffect`'s `load()` function:
```typescript
const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_GRAPHQL_URL;
let entries: AuditEntry[] | null = null;

if (indexerUrl) {
  try {
    entries = await fetchAuditEventsFromIndexer(projectId, indexerUrl, controller.signal);
  } catch (indexerErr) {
    if (!controller.signal.aborted) {
      console.warn("Indexer query failed, falling back to Blockscout:", indexerErr);
    }
  }
}

if (!entries) {
  // Execute existing Blockscout fetchRegistryLogs & fetchTransactionActor routine
  ...
}
```

- [ ] **Step 2: Verify `AuditLog` types and build**
Run: `pnpm --filter frontend build` (or `next build --webpack`) to verify zero type or build errors.

---

### Task 5: End-to-End Verification & Documentation

**Files:**
- Modify: `fheenv/frontend/README.md`
- Verify: Full repo lint and type-check

- [ ] **Step 1: Run format and type check**
Run:
```bash
pnpm format:check
pnpm lint
```

- [ ] **Step 2: Update `fheenv/frontend/README.md` with indexer instructions**
Add a short note explaining how to run the Ponder indexer locally and configure `NEXT_PUBLIC_INDEXER_GRAPHQL_URL`.

- [ ] **Step 3: Verification Check**
1. Test with `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` set: indexer queried cleanly.
2. Test without `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` set: falls back cleanly to Blockscout.
3. Verify CSV export works identically in both modes.
