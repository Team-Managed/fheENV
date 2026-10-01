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

export const EVENT_STYLES: Record<EventName, { label: string; color: string; dot: string }> = {
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

export const EVENT_TYPES: Record<EventName, string> = {
  ProjectCreated: "project_created",
  EnvironmentUpdated: "rotation",
  AccessGranted: "access_granted",
  AccessRevoked: "access_revoked",
  OwnerAdded: "owner_added",
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
      const isoTimestamp =
        !Number.isNaN(tsNum) && tsNum > 0
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
