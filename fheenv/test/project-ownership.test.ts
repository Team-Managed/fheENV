import { expect } from "chai";
import {
  reconstructOwnedProjects,
  type ProjectOwnershipEvent,
} from "../frontend/lib/project-ownership";
import { parseDeploymentBlock } from "../frontend/lib/contracts";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

type EventInput = ProjectOwnershipEvent extends infer Event
  ? Event extends ProjectOwnershipEvent
    ? Omit<Event, "blockNumber" | "logIndex">
    : never
  : never;

function event(value: EventInput, blockNumber: bigint, logIndex = 0): ProjectOwnershipEvent {
  return { ...value, blockNumber, logIndex };
}

describe("dashboard project ownership reconstruction", function () {
  it("includes projects created by the connected wallet and co-owner additions", function () {
    const projects = reconstructOwnedProjects(
      [
        event({ kind: "created", projectId: 2n, owner: ACCOUNT, name: "Created project" }, 10n),
        event({ kind: "created", projectId: 5n, owner: OTHER, name: "Shared project" }, 11n),
        event({ kind: "added", projectId: 5n, owner: ACCOUNT }, 12n),
      ],
      ACCOUNT,
    );

    expect(projects).to.deep.equal([
      { id: 2n, name: "Created project" },
      { id: 5n, name: "Shared project" },
    ]);
  });

  it("excludes ownership removed after project creation or addition", function () {
    const projects = reconstructOwnedProjects(
      [
        event({ kind: "created", projectId: 0n, owner: ACCOUNT, name: "Transferred" }, 1n),
        event({ kind: "removed", projectId: 0n, owner: ACCOUNT }, 3n),
        event({ kind: "created", projectId: 1n, owner: OTHER, name: "Revoked" }, 1n, 1),
        event({ kind: "added", projectId: 1n, owner: ACCOUNT }, 2n),
        event({ kind: "removed", projectId: 1n, owner: ACCOUNT }, 4n),
      ],
      ACCOUNT,
    );

    expect(projects).to.deep.equal([]);
  });

  it("applies events chronologically so a later re-add restores ownership", function () {
    const projects = reconstructOwnedProjects(
      [
        event({ kind: "added", projectId: 7n, owner: ACCOUNT }, 30n),
        event({ kind: "created", projectId: 7n, owner: OTHER, name: "Re-added" }, 10n),
        event({ kind: "removed", projectId: 7n, owner: ACCOUNT }, 20n),
        event({ kind: "added", projectId: 7n, owner: ACCOUNT }, 20n, 1),
      ],
      ACCOUNT,
    );

    expect(projects).to.deep.equal([{ id: 7n, name: "Re-added" }]);
  });

  it("matches addresses case-insensitively and returns deterministic project order", function () {
    const projects = reconstructOwnedProjects(
      [
        event({ kind: "created", projectId: 9n, owner: ACCOUNT.toUpperCase(), name: "Nine" }, 1n),
        event({ kind: "created", projectId: 3n, owner: ACCOUNT, name: "Three" }, 2n),
      ],
      ACCOUNT,
    );

    expect(projects).to.deep.equal([
      { id: 3n, name: "Three" },
      { id: 9n, name: "Nine" },
    ]);
  });
});

describe("dashboard deployment block configuration", function () {
  it("accepts an explicit non-negative block number", function () {
    expect(parseDeploymentBlock("123456")).to.equal(123456n);
    expect(parseDeploymentBlock("0")).to.equal(0n);
  });

  it("fails closed for absent, negative, or malformed values", function () {
    expect(parseDeploymentBlock(undefined)).to.equal(null);
    expect(parseDeploymentBlock("-1")).to.equal(null);
    expect(parseDeploymentBlock("12.5")).to.equal(null);
    expect(parseDeploymentBlock("latest")).to.equal(null);
  });
});
