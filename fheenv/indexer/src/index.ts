import { ponder } from "ponder:registry";
import { auditEvent } from "ponder:schema";

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
