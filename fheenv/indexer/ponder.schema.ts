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
