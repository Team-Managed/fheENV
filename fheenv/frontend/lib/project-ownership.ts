export type ProjectOwnershipEvent =
  | {
      kind: "created";
      projectId: bigint;
      owner: string;
      name: string;
      blockNumber: bigint;
      logIndex: number;
    }
  | {
      kind: "added" | "removed";
      projectId: bigint;
      owner: string;
      blockNumber: bigint;
      logIndex: number;
    };

export type OwnedProject = {
  id: bigint;
  name: string;
};

function compareEventPosition(left: ProjectOwnershipEvent, right: ProjectOwnershipEvent): number {
  if (left.blockNumber < right.blockNumber) return -1;
  if (left.blockNumber > right.blockNumber) return 1;
  return left.logIndex - right.logIndex;
}

export function reconstructOwnedProjects(
  events: readonly ProjectOwnershipEvent[],
  account: string,
): OwnedProject[] {
  const normalizedAccount = account.toLowerCase();
  const metadata = new Map<bigint, OwnedProject>();
  const ownership = new Map<bigint, boolean>();

  for (const event of [...events].sort(compareEventPosition)) {
    if (event.kind === "created") {
      metadata.set(event.projectId, { id: event.projectId, name: event.name });
    }

    if (event.owner.toLowerCase() !== normalizedAccount) continue;
    ownership.set(event.projectId, event.kind !== "removed");
  }

  return [...ownership.entries()]
    .filter(([, isOwner]) => isOwner)
    .map(([projectId]) => metadata.get(projectId))
    .filter((project): project is OwnedProject => project !== undefined)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
