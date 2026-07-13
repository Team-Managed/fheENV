import hre from "hardhat";
import { upgrades } from "hardhat";
import { CofheClient, Encryptable } from "@cofhe/sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

describe("fheENVRegistry", function () {
  this.timeout(60000);

  let cofheClient: CofheClient;
  let memberCofheClient: CofheClient;
  let owner: HardhatEthersSigner;
  let member: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let member2: HardhatEthersSigner;
  let member3: HardhatEthersSigner;
  let registry: any;

  const AES_KEY_HIGH = BigInt("0xdeadbeefcafebabe1234567890abcdef");
  const AES_KEY_LOW = BigInt("0xfeedfacebadf00d123456789abcdef01");
  const BLOB_CID = "QmTestBlobCID123456789";

  async function encryptAesKey() {
    const [high, low] = await cofheClient
      .encryptInputs([Encryptable.uint128(AES_KEY_HIGH), Encryptable.uint128(AES_KEY_LOW)])
      .execute();
    return { high, low };
  }

  /** Setup: create project 0 + push production env */
  async function setupWithEnv() {
    await registry.createProject("TestProject");
    const { high, low } = await encryptAesKey();
    await registry.updateEnvironment(0n, "production", high, low, BLOB_CID, 0n);
  }

  before(async function () {
    [owner, member, stranger, member2, member3] = await hre.ethers.getSigners();
    cofheClient = await hre.cofhe.createClientWithBatteries(owner);
    memberCofheClient = await hre.cofhe.createClientWithBatteries(member);
  });

  beforeEach(async function () {
    const Factory = await hre.ethers.getContractFactory("fheENVRegistry");
    registry = await upgrades.deployProxy(Factory, [owner.address], {
      kind: "uups",
      initializer: "initialize",
    });
    await registry.waitForDeployment();
  });

  // ─── Project management ──────────────────────────────────────────────────

  it("1. creates a project and emits ProjectCreated event", async function () {
    await expect(registry.createProject("my-app"))
      .to.emit(registry, "ProjectCreated")
      .withArgs(0n, owner.address, "my-app");
  });

  it("2. increments projectId for each project", async function () {
    await registry.createProject("Project A");
    await registry.createProject("Project B");
    expect(await registry.nextProjectId()).to.equal(2n);
  });

  it("3. rejects empty project name", async function () {
    await expect(registry.createProject("")).to.be.revertedWith("Name: 1-64 chars");
  });

  it("4. allows adding a co-owner", async function () {
    await registry.createProject("MyProject");
    await expect(registry.connect(owner).addOwner(0n, member.address))
      .to.emit(registry, "OwnerAdded")
      .withArgs(0n, member.address);
    expect(await registry.owners(0n, member.address)).to.equal(true);
  });

  // ─── Environment management ──────────────────────────────────────────────

  it("5. pushes an environment with version 0→1", async function () {
    await registry.createProject("MyProject");
    const { high, low } = await encryptAesKey();
    await registry.updateEnvironment(0n, "production", high, low, BLOB_CID, 0n);
    const [, , blobCid, version, updatedAt] = await registry.getEnvironment(0n, "production");
    expect(version).to.equal(1n);
    expect(blobCid).to.equal(BLOB_CID);
    expect(updatedAt).to.be.gt(0n);
  });

  it("6. rejects rotation with wrong expectedVersion", async function () {
    await registry.createProject("MyProject");
    const { high: h1, low: l1 } = await encryptAesKey();
    await registry.updateEnvironment(0n, "production", h1, l1, BLOB_CID, 0n);
    // Try to rotate with stale expectedVersion=0 — must fail
    const { high: h2, low: l2 } = await encryptAesKey();
    await expect(
      registry.updateEnvironment(0n, "production", h2, l2, BLOB_CID, 0n),
    ).to.be.revertedWith("Version mismatch: concurrent rotation detected");
  });

  it("7. rejects non-owner pushing", async function () {
    await registry.createProject("MyProject");
    const { high, low } = await encryptAesKey();
    await expect(
      registry.connect(stranger).updateEnvironment(0n, "production", high, low, BLOB_CID, 0n),
    ).to.be.revertedWith("Not a project owner");
  });

  // ─── Access control ──────────────────────────────────────────────────────

  it("8. grants access to a member", async function () {
    await setupWithEnv();
    await registry.grantAccess(0n, "production", member.address);
    expect(await registry.hasAccess(0n, "production", member.address)).to.equal(true);
  });

  it("9. batch grants access to multiple members", async function () {
    await setupWithEnv();
    const addrs = [member.address, member2.address, member3.address];
    await registry.batchGrantAccess(0n, "production", addrs);
    for (const addr of addrs) {
      expect(await registry.hasAccess(0n, "production", addr)).to.equal(true);
    }
  });

  it("10. revokes access", async function () {
    await setupWithEnv();
    await registry.grantAccess(0n, "production", member.address);
    await registry.revokeAccess(0n, "production", member.address);
    // hasAccess returns false — FHE cryptographic access on old ciphertext
    // persists until rotation (intended behavior per contract comments)
    expect(await registry.hasAccess(0n, "production", member.address)).to.equal(false);
  });

  it("11. rejects access grant by non-owner", async function () {
    await setupWithEnv();
    await expect(
      registry.connect(stranger).grantAccess(0n, "production", member.address),
    ).to.be.revertedWith("Not a project owner");
  });

  it("12. rejects batch with >100 members", async function () {
    await setupWithEnv();
    const addrs = Array.from(
      { length: 101 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`,
    );
    await expect(registry.batchGrantAccess(0n, "production", addrs)).to.be.revertedWith(
      "Max 100 members per batch",
    );
  });

  it("13. transferOwnership works", async function () {
    await registry.createProject("MyProject");
    await registry["transferOwnership(uint256,address)"](0n, stranger.address);
    expect(await registry.owners(0n, owner.address)).to.equal(false);
    expect(await registry.owners(0n, stranger.address)).to.equal(true);
  });

  it("14. envNameToHash produces consistent results", async () => {
    const h1 = await registry.envNameToHash("production");
    const h2 = await registry.envNameToHash("production");
    const h3 = await registry.envNameToHash("staging");
    expect(h1).to.equal(h2);
    expect(h1).to.not.equal(h3);
  });

  // ─── Edge cases from spec ────────────────────────────────────────────────

  it("15. rejects project name longer than 64 chars", async function () {
    const longName = "a".repeat(65);
    await expect(registry.createProject(longName)).to.be.revertedWith("Name: 1-64 chars");
  });

  it("16. rejects operations on non-existent project", async function () {
    const { high, low } = await encryptAesKey();
    await expect(
      registry.updateEnvironment(99n, "production", high, low, BLOB_CID, 0n),
    ).to.be.revertedWith("Project does not exist");
    await expect(registry.grantAccess(99n, "production", member.address)).to.be.revertedWith(
      "Project does not exist",
    );
    await expect(registry.revokeAccess(99n, "production", member.address)).to.be.revertedWith(
      "Project does not exist",
    );
  });

  it("17. rejects addOwner by non-owner", async function () {
    await registry.createProject("MyProject");
    await expect(registry.connect(stranger).addOwner(0n, member.address)).to.be.revertedWith(
      "Not a project owner",
    );
  });

  it("18. rejects addOwner with zero address", async function () {
    await registry.createProject("MyProject");
    await expect(
      registry.addOwner(0n, "0x0000000000000000000000000000000000000000"),
    ).to.be.revertedWith("Invalid address");
  });

  it("19. co-owner can push and grant access", async function () {
    // Owner adds a co-owner; co-owner should be able to push + grant
    await registry.createProject("SharedProject");
    await registry.addOwner(0n, member.address);

    // Encrypt inputs using member's own cofheClient (inputs are account-bound)
    const [high, low] = await memberCofheClient
      .encryptInputs([Encryptable.uint128(AES_KEY_HIGH), Encryptable.uint128(AES_KEY_LOW)])
      .execute();

    // co-owner pushes env — must succeed
    await expect(registry.connect(member).updateEnvironment(0n, "staging", high, low, BLOB_CID, 0n))
      .to.not.be.reverted;

    // co-owner grants to stranger — must succeed
    await expect(registry.connect(member).grantAccess(0n, "staging", stranger.address)).to.not.be
      .reverted;
    expect(await registry.hasAccess(0n, "staging", stranger.address)).to.equal(true);
  });

  it("20. grantAccess on uninitialized env reverts", async function () {
    await registry.createProject("MyProject");
    await expect(registry.grantAccess(0n, "never-pushed", member.address)).to.be.revertedWith(
      "Environment not initialized",
    );
  });

  it("21. revokeAccess on uninitialized env reverts", async function () {
    await registry.createProject("MyProject");
    await expect(registry.revokeAccess(0n, "never-pushed", member.address)).to.be.revertedWith(
      "Environment not initialized",
    );
  });

  it("22. getEnvironment on uninitialized env reverts", async function () {
    await registry.createProject("MyProject");
    await expect(registry.getEnvironment(0n, "never-pushed")).to.be.revertedWith(
      "Environment not initialized",
    );
  });

  it("23. rejects empty blobCid", async function () {
    await registry.createProject("MyProject");
    const { high, low } = await encryptAesKey();
    await expect(
      registry.updateEnvironment(0n, "production", high, low, "", 0n),
    ).to.be.revertedWith("Invalid blobCid");
  });

  it("24. rejects blobCid longer than 128 chars", async function () {
    await registry.createProject("MyProject");
    const { high, low } = await encryptAesKey();
    const longCid = "Q".repeat(129);
    await expect(
      registry.updateEnvironment(0n, "production", high, low, longCid, 0n),
    ).to.be.revertedWith("Invalid blobCid");
  });

  it("25. rejects grantAccess with zero address", async function () {
    await setupWithEnv();
    await expect(
      registry.grantAccess(0n, "production", "0x0000000000000000000000000000000000000000"),
    ).to.be.revertedWith("Invalid address");
  });

  it("26. rejects batchGrantAccess containing zero address", async function () {
    await setupWithEnv();
    await expect(
      registry.batchGrantAccess(0n, "production", [
        member.address,
        "0x0000000000000000000000000000000000000000",
      ]),
    ).to.be.revertedWith("Invalid address in batch");
  });

  it("27. rejects transferOwnership to self", async function () {
    await registry.createProject("MyProject");
    await expect(
      registry["transferOwnership(uint256,address)"](0n, owner.address),
    ).to.be.revertedWith("Already owner");
  });

  it("28. rejects transferOwnership to zero address", async function () {
    await registry.createProject("MyProject");
    await expect(
      registry["transferOwnership(uint256,address)"](
        0n,
        "0x0000000000000000000000000000000000000000",
      ),
    ).to.be.revertedWith("Invalid address");
  });

  it("29. rejects transferOwnership by non-owner", async function () {
    await registry.createProject("MyProject");
    await expect(
      registry.connect(stranger)["transferOwnership(uint256,address)"](0n, member.address),
    ).to.be.revertedWith("Not a project owner");
  });

  it("30. multiple projects are isolated from each other", async function () {
    await registry.createProject("project-A");
    await registry.connect(member).createProject("project-B"); // member owns project 1

    const { high, low } = await encryptAesKey();
    // owner can push to project 0
    await registry.updateEnvironment(0n, "production", high, low, BLOB_CID, 0n);
    // owner cannot push to project 1 (member owns it)
    const { high: h2, low: l2 } = await encryptAesKey();
    await expect(
      registry.updateEnvironment(1n, "production", h2, l2, BLOB_CID, 0n),
    ).to.be.revertedWith("Not a project owner");
  });

  it("31. multiple environments in the same project are independent", async function () {
    await registry.createProject("MyProject");
    const { high: hD, low: lD } = await encryptAesKey();
    const { high: hP, low: lP } = await encryptAesKey();

    await registry.updateEnvironment(0n, "development", hD, lD, "QmDevCID", 0n);
    await registry.updateEnvironment(0n, "production", hP, lP, "QmProdCID", 0n);

    const [, , devCid, devVer] = await registry.getEnvironment(0n, "development");
    const [, , prodCid, prodVer] = await registry.getEnvironment(0n, "production");

    expect(devCid).to.equal("QmDevCID");
    expect(prodCid).to.equal("QmProdCID");
    expect(devVer).to.equal(1n);
    expect(prodVer).to.equal(1n);

    // granting access to dev does not affect prod
    await registry.grantAccess(0n, "development", member.address);
    expect(await registry.hasAccess(0n, "development", member.address)).to.equal(true);
    expect(await registry.hasAccess(0n, "production", member.address)).to.equal(false);
  });

  it("32. revokeAccess emits AccessRevoked event", async function () {
    await setupWithEnv();
    await registry.grantAccess(0n, "production", member.address);
    await expect(registry.revokeAccess(0n, "production", member.address)).to.emit(
      registry,
      "AccessRevoked",
    );
  });

  it("33. version increments correctly through multiple rotations", async function () {
    await registry.createProject("MyProject");
    for (let v = 0n; v < 3n; v++) {
      const { high, low } = await encryptAesKey();
      await registry.updateEnvironment(0n, "production", high, low, BLOB_CID, v);
    }
    const [, , , version] = await registry.getEnvironment(0n, "production");
    expect(version).to.equal(3n);
  });

  it("34. env names are case-SENSITIVE (caller must normalize)", async function () {
    // The contract hashes the raw name — 'Production' and 'production' are different envs.
    // This is by design: the CLI normalises to lowercase before calling the contract.
    await registry.createProject("MyProject");
    const { high: h1, low: l1 } = await encryptAesKey();
    const { high: h2, low: l2 } = await encryptAesKey();

    await registry.updateEnvironment(0n, "production", h1, l1, "QmLower", 0n);
    await registry.updateEnvironment(0n, "Production", h2, l2, "QmUpper", 0n);

    const [, , cidLower] = await registry.getEnvironment(0n, "production");
    const [, , cidUpper] = await registry.getEnvironment(0n, "Production");
    expect(cidLower).to.equal("QmLower");
    expect(cidUpper).to.equal("QmUpper");
  });

  // ─── UUPS proxy & upgrade ───────────────────────────────────────────────────

  it("35. proxy owner is the initial owner passed to initialize()", async function () {
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("36. non-owner cannot upgrade the proxy", async function () {
    const Factory = await hre.ethers.getContractFactory("fheENVRegistry");
    await expect(
      upgrades.upgradeProxy(await registry.getAddress(), Factory.connect(stranger), {
        kind: "uups",
      }),
    ).to.be.reverted;
  });

  it("37. upgrade preserves all project and environment state", async function () {
    // Populate state before upgrade
    await registry.createProject("pre-upgrade-project");
    const { high, low } = await encryptAesKey();
    await registry.updateEnvironment(0n, "production", high, low, BLOB_CID, 0n);
    await registry.grantAccess(0n, "production", member.address);

    const proxyAddress = await registry.getAddress();
    const nextIdBefore = await registry.nextProjectId();
    const [, , cidBefore, verBefore] = await registry.getEnvironment(0n, "production");
    const hasAccessBefore = await registry.hasAccess(0n, "production", member.address);

    // Upgrade to the same implementation (simulates a no-op patch)
    const Factory = await hre.ethers.getContractFactory("fheENVRegistry");
    await upgrades.upgradeProxy(proxyAddress, Factory, { kind: "uups" });

    // Proxy address must not change
    expect(await registry.getAddress()).to.equal(proxyAddress);

    // All state must survive the upgrade
    expect(await registry.nextProjectId()).to.equal(nextIdBefore);
    const [, , cidAfter, verAfter] = await registry.getEnvironment(0n, "production");
    expect(cidAfter).to.equal(cidBefore);
    expect(verAfter).to.equal(verBefore);
    expect(await registry.hasAccess(0n, "production", member.address)).to.equal(hasAccessBefore);
    expect(await registry.owners(0n, owner.address)).to.equal(true);
  });

  it("38. re-initializing the proxy reverts (initializer guard)", async function () {
    await expect(registry.initialize(stranger.address)).to.be.reverted;
  });

  it("39. owner can transfer proxy ownership via OwnableUpgradeable", async function () {
    await registry.transferOwnership(member.address);
    expect(await registry.owner()).to.equal(member.address);
  });

  // ─── removeOwner ─────────────────────────────────────────────────────────────

  it("40. primary owner can remove a co-owner", async function () {
    await registry.createProject("MyProject");
    await registry.addOwner(0n, member.address);
    expect(await registry.owners(0n, member.address)).to.equal(true);

    await registry.removeOwner(0n, member.address);
    expect(await registry.owners(0n, member.address)).to.equal(false);
  });

  it("41. removeOwner emits OwnerRemoved event", async function () {
    await registry.createProject("MyProject");
    await registry.addOwner(0n, member.address);
    await expect(registry.removeOwner(0n, member.address))
      .to.emit(registry, "OwnerRemoved")
      .withArgs(0n, member.address);
  });

  it("42. non-primary co-owner cannot remove another co-owner", async function () {
    await registry.createProject("MyProject");
    await registry.addOwner(0n, member.address);
    await registry.addOwner(0n, member2.address);
    await expect(registry.connect(member).removeOwner(0n, member2.address)).to.be.revertedWith(
      "Only primary owner can remove co-owners",
    );
  });

  it("43. cannot remove the primary owner", async function () {
    await registry.createProject("MyProject");
    // Even the primary owner cannot remove themselves via removeOwner
    await expect(registry.removeOwner(0n, owner.address)).to.be.revertedWith(
      "Cannot remove primary owner",
    );
  });

  it("44. cannot remove an address that is not an owner", async function () {
    await registry.createProject("MyProject");
    await expect(registry.removeOwner(0n, stranger.address)).to.be.revertedWith(
      "Address is not an owner",
    );
  });

  it("45. removeOwner with zero address reverts", async function () {
    await registry.createProject("MyProject");
    await expect(
      registry.removeOwner(0n, "0x0000000000000000000000000000000000000000"),
    ).to.be.revertedWith("Invalid address");
  });
});
