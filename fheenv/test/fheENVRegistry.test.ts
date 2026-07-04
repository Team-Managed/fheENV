import hre from "hardhat";
import { CofheClient, Encryptable } from "@cofhe/sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

describe("fheENVRegistry", function () {
  this.timeout(60000);

  let cofheClient: CofheClient;
  let owner: HardhatEthersSigner;
  let member: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let member2: HardhatEthersSigner;
  let member3: HardhatEthersSigner;
  let registry: any;

  const AES_KEY_HIGH = BigInt("0xdeadbeefcafebabe1234567890abcdef");
  const AES_KEY_LOW  = BigInt("0xfeedfacebadf00d123456789abcdef01");
  const BLOB_CID = "QmTestBlobCID123456789";

  async function encryptAesKey() {
    const [high, low] = await cofheClient
      .encryptInputs([
        Encryptable.uint128(AES_KEY_HIGH),
        Encryptable.uint128(AES_KEY_LOW),
      ])
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
  });

  beforeEach(async function () {
    const Factory = await hre.ethers.getContractFactory("fheENVRegistry");
    registry = await Factory.deploy();
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
    const addrs = Array.from({ length: 101 }, (_, i) =>
      `0x${(i + 1).toString(16).padStart(40, "0")}`,
    );
    await expect(
      registry.batchGrantAccess(0n, "production", addrs),
    ).to.be.revertedWith("Max 100 members per batch");
  });

  it("13. transferOwnership works", async function () {
    await registry.createProject("MyProject");
    await registry.transferOwnership(0n, stranger.address);
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
});

