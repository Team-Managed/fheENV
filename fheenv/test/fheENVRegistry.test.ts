import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { Encryptable } from "@cofhe/sdk";

const AES_KEY_HIGH = 0xdeadbeef1234567890abcdeadbeef12n;
const AES_KEY_LOW = 0xfeedcafe87654321fedcba9876543210n;
const BLOB_CID = "QmTestCIDabcdefg1234567890abcdef";

describe("fheENVRegistry", async () => {
  const conn = await network.connect();
  const { viem, cofhe } = conn;
  const publicClient = await viem.getPublicClient();
  const [ownerWallet, nonOwnerWallet, member1Wallet, member2Wallet, member3Wallet] =
    await viem.getWalletClients();

  // Create one CoFHE client for the suite (reused across tests)
  const ownerClient = await cofhe.createClientWithBatteries(ownerWallet);

  async function deployRegistry() {
    return viem.deployContract("fheENVRegistry");
  }

  async function getEncryptedKeys() {
    const [high, low] = await ownerClient
      .encryptInputs([Encryptable.uint128(AES_KEY_HIGH), Encryptable.uint128(AES_KEY_LOW)])
      .execute();
    return { high, low };
  }

  /** Create project 0 + push production env; returns projectId. */
  async function setupWithEnv(registry: Awaited<ReturnType<typeof deployRegistry>>) {
    await registry.write.createProject(["TestProject"]);
    const { high, low } = await getEncryptedKeys();
    await registry.write.updateEnvironment([0n, "production", high, low, BLOB_CID, 0n]);
    return 0n;
  }

  // ─── Project management ──────────────────────────────────────────────────

  it("1. creates a project and emits ProjectCreated event", async () => {
    const registry = await deployRegistry();
    const txHash = await registry.write.createProject(["MyProject"]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const events = await publicClient.getContractEvents({
      address: registry.address,
      abi: registry.abi,
      eventName: "ProjectCreated",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].args.name, "MyProject");
    assert.equal(
      events[0].args.owner?.toLowerCase(),
      ownerWallet.account.address.toLowerCase(),
    );
    assert.equal(events[0].args.projectId, 0n);
  });

  it("2. increments projectId for each new project", async () => {
    const registry = await deployRegistry();
    await registry.write.createProject(["Project A"]);
    await registry.write.createProject(["Project B"]);
    const next = await registry.read.nextProjectId();
    assert.equal(next, 2n);
  });

  it("3. rejects empty project name", async () => {
    const registry = await deployRegistry();
    let threw = false;
    try {
      await registry.write.createProject([""]);
    } catch {
      threw = true;
    }
    assert.ok(threw, "should revert on empty name");
  });

  it("4. allows adding a co-owner", async () => {
    const registry = await deployRegistry();
    await registry.write.createProject(["MyProject"]);
    const txHash = await registry.write.addOwner([0n, nonOwnerWallet.account.address]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const events = await publicClient.getContractEvents({
      address: registry.address,
      abi: registry.abi,
      eventName: "OwnerAdded",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(events.length, 1);
    assert.equal(
      events[0].args.newOwner?.toLowerCase(),
      nonOwnerWallet.account.address.toLowerCase(),
    );
    const isOwner = await registry.read.owners([0n, nonOwnerWallet.account.address]);
    assert.ok(isOwner);
  });

  // ─── Environment management ──────────────────────────────────────────────

  it("5. pushes an environment with version 0→1", async () => {
    const registry = await deployRegistry();
    await registry.write.createProject(["MyProject"]);
    const { high, low } = await getEncryptedKeys();
    await registry.write.updateEnvironment([0n, "production", high, low, BLOB_CID, 0n]);
    const [, , blobCid, version] = await registry.read.getEnvironment([0n, "production"]);
    assert.equal(version, 1n);
    assert.equal(blobCid, BLOB_CID);
  });

  it("6. rejects rotation with wrong expectedVersion (concurrent rotation guard)", async () => {
    const registry = await deployRegistry();
    await registry.write.createProject(["MyProject"]);
    // First rotation (0→1) succeeds
    const { high: h1, low: l1 } = await getEncryptedKeys();
    await registry.write.updateEnvironment([0n, "production", h1, l1, BLOB_CID, 0n]);
    // Second rotation with stale expectedVersion=0 must fail
    const { high: h2, low: l2 } = await getEncryptedKeys();
    let threw = false;
    try {
      await registry.write.updateEnvironment([0n, "production", h2, l2, BLOB_CID, 0n]);
    } catch {
      threw = true;
    }
    assert.ok(threw, "should revert on version mismatch");
  });

  it("7. treats env names consistently via hash", async () => {
    const registry = await deployRegistry();
    const hash1 = await registry.read.envNameToHash(["production"]);
    const hash2 = await registry.read.envNameToHash(["production"]);
    assert.deepEqual(hash1, hash2, "same name must produce same hash");
    const hash3 = await registry.read.envNameToHash(["staging"]);
    assert.notDeepEqual(hash1, hash3, "different names must produce different hashes");
  });

  it("8. rejects non-owner pushing environment", async () => {
    const registry = await deployRegistry();
    await registry.write.createProject(["MyProject"]);
    const { high, low } = await getEncryptedKeys();
    let threw = false;
    try {
      await nonOwnerWallet.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "updateEnvironment",
        args: [0n, "production", high, low, BLOB_CID, 0n],
        account: nonOwnerWallet.account,
        chain: null,
      });
    } catch {
      threw = true;
    }
    assert.ok(threw, "non-owner should not be able to push environment");
  });

  // ─── Access control ──────────────────────────────────────────────────────

  it("9. grants access to a member (grantAccess + hasAccess)", async () => {
    const registry = await deployRegistry();
    const projectId = await setupWithEnv(registry);
    await registry.write.grantAccess([projectId, "production", member1Wallet.account.address]);
    const hasAccess = await registry.read.hasAccess([
      projectId,
      "production",
      member1Wallet.account.address,
    ]);
    assert.ok(hasAccess, "member1 should have access after grantAccess");
  });

  it("10. batch grants access to multiple members", async () => {
    const registry = await deployRegistry();
    const projectId = await setupWithEnv(registry);
    const members = [
      member1Wallet.account.address,
      member2Wallet.account.address,
      member3Wallet.account.address,
    ] as const;
    await registry.write.batchGrantAccess([projectId, "production", members]);
    for (const m of members) {
      const hasAccess = await registry.read.hasAccess([projectId, "production", m]);
      assert.ok(hasAccess, `${m} should have access after batchGrantAccess`);
    }
  });

  it("11. revokes access", async () => {
    const registry = await deployRegistry();
    const projectId = await setupWithEnv(registry);
    await registry.write.grantAccess([projectId, "production", member1Wallet.account.address]);
    await registry.write.revokeAccess([projectId, "production", member1Wallet.account.address]);
    const hasAccess = await registry.read.hasAccess([
      projectId,
      "production",
      member1Wallet.account.address,
    ]);
    assert.ok(!hasAccess, "member1 should NOT have access after revokeAccess");
  });

  it("12. rejects access grant by non-owner", async () => {
    const registry = await deployRegistry();
    const projectId = await setupWithEnv(registry);
    let threw = false;
    try {
      await nonOwnerWallet.writeContract({
        address: registry.address,
        abi: registry.abi,
        functionName: "grantAccess",
        args: [projectId, "production", member1Wallet.account.address],
        account: nonOwnerWallet.account,
        chain: null,
      });
    } catch {
      threw = true;
    }
    assert.ok(threw, "non-owner should not be able to grant access");
  });

  it("13. rejects batch with >100 members", async () => {
    const registry = await deployRegistry();
    const projectId = await setupWithEnv(registry);
    // Build 101 dummy addresses
    const members = Array.from(
      { length: 101 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
    );
    let threw = false;
    try {
      await registry.write.batchGrantAccess([projectId, "production", members]);
    } catch {
      threw = true;
    }
    assert.ok(threw, "should revert when batch exceeds 100 members");
  });
});
