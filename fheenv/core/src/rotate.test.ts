/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { expect } from "chai";
import sinon from "sinon";
import {
  rotateEnvironment,
  decryptEnvironmentContent,
  type RotateEnvironmentParams,
  type DecryptEnvironmentParams,
} from "./rotate";
import {
  generateAesKeyNode,
  aesEncryptNode,
  aesDecryptNode,
  splitAesKeyToUint128Node,
  joinUint128ToAesKeyNode,
} from "./aes";
import { uploadToIPFSNode, fetchFromIPFSNode } from "./ipfs";

describe("Rotation Pipeline", function () {
  describe("rotateEnvironment", function () {
    let uploadStub: any;
    let getEnvStub: any;
    let getMembersStub: any;
    let updateEnvStub: any;
    let batchGrantStub: any;
    let createFheClientStub: any;
    let fheEncryptStub: any;

    beforeEach(function () {
      uploadStub = sinon.stub(require("./ipfs"), "uploadToIPFSNode").resolves("QmNewCID123");
      getEnvStub = sinon.stub().resolves({
        blobCid: "QmOldCID456",
        version: 1n,
        aesKeyHigh: 0n,
        aesKeyLow: 0n,
        updatedAt: 1234567890n,
      });
      getMembersStub = sinon
        .stub()
        .resolves([
          "0xMember1Address" as `0x${string}`,
          "0xMember2Address" as `0x${string}`,
          "0xMember3Address" as `0x${string}`,
        ]);
      updateEnvStub = sinon.stub().resolves("0xtxhash123");
      batchGrantStub = sinon.stub().resolves(undefined);
      createFheClientStub = sinon.stub().resolves({});
      fheEncryptStub = sinon.stub().resolves({
        ctHash: 123n,
        securityZone: 1,
        utype: 1,
        signature: "0xsignature",
      });

      // Stub the contract functions
      sinon.stub(require("./contracts"), "getEnvironment").callsFake(getEnvStub);
      sinon.stub(require("./contracts"), "getActiveMembers").callsFake(getMembersStub);
      sinon.stub(require("./contracts"), "updateEnvironment").callsFake(updateEnvStub);
      sinon.stub(require("./contracts"), "batchGrantAccess").callsFake(batchGrantStub);
      sinon.stub(require("./fhe"), "createFheClient").callsFake(createFheClientStub);
      sinon.stub(require("./fhe"), "fheEncryptUint128").callsFake(fheEncryptStub);
    });

    afterEach(function () {
      sinon.restore();
    });

    it("should rotate environment successfully", async function () {
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db\nAPI_KEY=newsecret",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      const result = await rotateEnvironment(params);

      expect(result.newCid).to.equal("QmNewCID123");
      expect(result.previousCid).to.equal("QmOldCID456");
      expect(result.newVersion).to.equal(2n);
      expect(result.membersRegranted).to.have.lengthOf(3);
      expect(result.txHash).to.equal("0xtxhash123");

      expect(uploadStub.calledOnce).to.be.true;
      expect(getEnvStub.calledOnce).to.be.true;
      expect(getMembersStub.calledOnce).to.be.true;
      expect(updateEnvStub.calledOnce).to.be.true;
      expect(batchGrantStub.calledOnce).to.be.true;
    });

    it("should exclude specified members from re-granting", async function () {
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
        excludeMembers: ["0xMember2Address"],
      };

      const result = await rotateEnvironment(params);

      expect(result.membersRegranted).to.have.lengthOf(2);
      expect(result.membersRegranted).to.not.include("0xMember2Address");
    });

    it("should use knownMembers when provided, skipping event scanning", async function () {
      const knownMembers = ["0xKnownMember1" as `0x${string}`, "0xKnownMember2" as `0x${string}`];
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
        knownMembers,
      };

      const result = await rotateEnvironment(params);

      expect(getMembersStub.called).to.be.false; // Should not scan events
      expect(result.membersRegranted).to.deep.equal(knownMembers);
    });

    it("should throw error when environment not initialized", async function () {
      getEnvStub.resolves({
        blobCid: "",
        version: 0n,
        aesKeyHigh: 0n,
        aesKeyLow: 0n,
        updatedAt: 0n,
      });

      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      try {
        await rotateEnvironment(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("has not been pushed yet");
      }
    });

    it("should throw error when wallet has no account", async function () {
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: {} as any, // No account
      };

      try {
        await rotateEnvironment(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("WalletClient has no account");
      }
    });

    it("should handle empty member list (no batchGrantAccess call)", async function () {
      getMembersStub.resolves([]);
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      const result = await rotateEnvironment(params);

      expect(result.membersRegranted).to.have.lengthOf(0);
      expect(batchGrantStub.called).to.be.false;
    });

    it("should handle all members excluded", async function () {
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
        excludeMembers: ["0xMember1Address", "0xMember2Address", "0xMember3Address"],
      };

      const result = await rotateEnvironment(params);

      expect(result.membersRegranted).to.have.lengthOf(0);
      expect(batchGrantStub.called).to.be.false;
    });

    it("should handle case-insensitive address matching in excludeMembers", async function () {
      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
        excludeMembers: ["0xmember1address" as `0x${string}`], // Lowercase
      };

      const result = await rotateEnvironment(params);

      expect(result.membersRegranted).to.have.lengthOf(2);
      expect(result.membersRegranted).to.not.include("0xMember1Address");
    });

    it("should increment version correctly", async function () {
      getEnvStub.resolves({
        blobCid: "QmOldCID",
        version: 5n,
        aesKeyHigh: 0n,
        aesKeyLow: 0n,
        updatedAt: 1234567890n,
      });

      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      const result = await rotateEnvironment(params);

      expect(result.newVersion).to.equal(6n);
    });

    it("should pass expectedVersion to updateEnvironment", async function () {
      getEnvStub.resolves({
        blobCid: "QmOldCID",
        version: 3n,
        aesKeyHigh: 0n,
        aesKeyLow: 0n,
        updatedAt: 1234567890n,
      });

      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      await rotateEnvironment(params);

      expect(updateEnvStub.calledOnce).to.be.true;
      const callArgs = updateEnvStub.getCall(0).args;
      expect(callArgs[2].expectedVersion).to.equal(3n);
    });

    it("should handle IPFS upload failure", async function () {
      uploadStub.rejects(new Error("IPFS upload failed"));

      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      try {
        await rotateEnvironment(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("IPFS upload failed");
      }
    });

    it("should handle contract update failure", async function () {
      updateEnvStub.rejects(new Error("Contract update failed"));

      const params: RotateEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        envContent: "DATABASE_URL=postgres://localhost/db",
        pinataJwt: "test-jwt",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      try {
        await rotateEnvironment(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Contract update failed");
      }
    });
  });

  describe("decryptEnvironmentContent", function () {
    let getEnvStub: any;
    let fetchStub: any;
    let createFheClientStub: any;
    let fheDecryptStub: any;

    beforeEach(function () {
      getEnvStub = sinon.stub().resolves({
        blobCid: "QmTestCID",
        version: 1n,
        aesKeyHigh: 0xdeadbeefcafebaben,
        aesKeyLow: 0xfeedfacebadf00dn,
        updatedAt: 1234567890n,
      });
      fetchStub = sinon
        .stub(require("./ipfs"), "fetchFromIPFSNode")
        .resolves("encrypted-blob-data");
      createFheClientStub = sinon.stub().resolves({});
      fheDecryptStub = sinon.stub().resolves(1234567890n);

      sinon.stub(require("./contracts"), "getEnvironment").callsFake(getEnvStub);
      sinon.stub(require("./fhe"), "createFheClient").callsFake(createFheClientStub);
      sinon.stub(require("./fhe"), "fheDecryptUint128").callsFake(fheDecryptStub);
    });

    afterEach(function () {
      sinon.restore();
    });

    it("should decrypt environment content successfully", async function () {
      const params: DecryptEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      // Mock the AES decryption by replacing the function
      const aesDecryptStub = sinon
        .stub(require("./aes"), "aesDecryptNode")
        .returns("DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret");

      const result = await decryptEnvironmentContent(params);

      expect(result.envContent).to.equal("DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret");
      expect(result.blobCid).to.equal("QmTestCID");
      expect(result.version).to.equal(1n);
      expect(result.updatedAt).to.equal(1234567890n);

      expect(getEnvStub.calledOnce).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      expect(fheDecryptStub.calledTwice).to.be.true; // Once for high, once for low
    });

    it("should throw error when environment not initialized", async function () {
      getEnvStub.resolves({
        blobCid: "",
        version: 0n,
        aesKeyHigh: 0n,
        aesKeyLow: 0n,
        updatedAt: 0n,
      });

      const params: DecryptEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      try {
        await decryptEnvironmentContent(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("has not been pushed yet");
      }
    });

    it("should handle IPFS fetch failure", async function () {
      fetchStub.rejects(new Error("IPFS fetch failed"));

      const params: DecryptEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      try {
        await decryptEnvironmentContent(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("IPFS fetch failed");
      }
    });

    it("should handle FHE decryption failure", async function () {
      fheDecryptStub.rejects(new Error("FHE decryption failed"));

      const params: DecryptEnvironmentParams = {
        registryAddress: "0xRegistryAddress" as `0x${string}`,
        projectId: 0n,
        envName: "production",
        chainId: 11155111,
        publicClient: {} as any,
        walletClient: { account: { address: "0xOwnerAddress" as `0x${string}` } } as any,
      };

      try {
        await decryptEnvironmentContent(params);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("FHE decryption failed");
      }
    });
  });

  describe("integration scenarios", function () {
    it("should handle full rotate workflow with real AES operations", async function () {
      const envContent = "DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret123";
      const aesKey = generateAesKeyNode();
      const encryptedBlob = aesEncryptNode(envContent, aesKey);
      const [keyHigh, keyLow] = splitAesKeyToUint128Node(aesKey);

      // Verify round-trip
      const rejoinedKey = joinUint128ToAesKeyNode(keyHigh, keyLow);
      const decrypted = aesDecryptNode(encryptedBlob, rejoinedKey);

      expect(decrypted).to.equal(envContent);
      expect(rejoinedKey).to.deep.equal(aesKey);
    });

    it("should handle large environment files in rotation", async function () {
      const lines = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`VAR_${i}=value_${i}`);
      }
      const largeEnvContent = lines.join("\n");

      const aesKey = generateAesKeyNode();
      const encryptedBlob = aesEncryptNode(largeEnvContent, aesKey);
      const [keyHigh, keyLow] = splitAesKeyToUint128Node(aesKey);

      const rejoinedKey = joinUint128ToAesKeyNode(keyHigh, keyLow);
      const decrypted = aesDecryptNode(encryptedBlob, rejoinedKey);

      expect(decrypted).to.equal(largeEnvContent);
    });
  });
});
