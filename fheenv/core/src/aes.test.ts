/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect } from "chai";
import {
  generateAesKeyNode,
  aesEncryptNode,
  aesDecryptNode,
  splitAesKeyToUint128Node,
  joinUint128ToAesKeyNode,
} from "./aes";

describe("AES-256-GCM Encryption", function () {
  describe("generateAesKeyNode", function () {
    it("should generate a 32-byte key", function () {
      const key = generateAesKeyNode();
      expect(key).to.be.instanceOf(Buffer);
      expect(key.length).to.equal(32);
    });

    it("should generate different keys each time", function () {
      const key1 = generateAesKeyNode();
      const key2 = generateAesKeyNode();
      expect(key1.toString("hex")).to.not.equal(key2.toString("hex"));
    });
  });

  describe("aesEncryptNode and aesDecryptNode", function () {
    it("should encrypt and decrypt plaintext correctly", function () {
      const plaintext = "DATABASE_URL=postgres://localhost/mydb\nAPI_KEY=secret123";
      const key = generateAesKeyNode();

      const encrypted = aesEncryptNode(plaintext, key);
      const decrypted = aesDecryptNode(encrypted, key);

      expect(decrypted).to.equal(plaintext);
    });

    it("should produce different ciphertext for same plaintext (due to random IV)", function () {
      const plaintext = "TEST=value";
      const key = generateAesKeyNode();

      const encrypted1 = aesEncryptNode(plaintext, key);
      const encrypted2 = aesEncryptNode(plaintext, key);

      expect(encrypted1).to.not.equal(encrypted2);
    });

    it("should decrypt both ciphertexts to the same plaintext", function () {
      const plaintext = "TEST=value";
      const key = generateAesKeyNode();

      const encrypted1 = aesEncryptNode(plaintext, key);
      const encrypted2 = aesEncryptNode(plaintext, key);

      expect(aesDecryptNode(encrypted1, key)).to.equal(plaintext);
      expect(aesDecryptNode(encrypted2, key)).to.equal(plaintext);
    });

    it("should handle empty strings", function () {
      const plaintext = "";
      const key = generateAesKeyNode();

      const encrypted = aesEncryptNode(plaintext, key);
      const decrypted = aesDecryptNode(encrypted, key);

      expect(decrypted).to.equal(plaintext);
    });

    it("should handle special characters", function () {
      const plaintext = "KEY=value!@#$%^&*()_+-=[]{}|;':\",./<>?\nNEWLINE\tTAB";
      const key = generateAesKeyNode();

      const encrypted = aesEncryptNode(plaintext, key);
      const decrypted = aesDecryptNode(encrypted, key);

      expect(decrypted).to.equal(plaintext);
    });

    it("should handle large .env files", function () {
      const lines = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`VAR_${i}=value_${i}`);
      }
      const plaintext = lines.join("\n");
      const key = generateAesKeyNode();

      const encrypted = aesEncryptNode(plaintext, key);
      const decrypted = aesDecryptNode(encrypted, key);

      expect(decrypted).to.equal(plaintext);
    });

    it("should fail to decrypt with wrong key", function () {
      const plaintext = "SECRET=value";
      const key1 = generateAesKeyNode();
      const key2 = generateAesKeyNode();

      const encrypted = aesEncryptNode(plaintext, key1);

      expect(() => aesDecryptNode(encrypted, key2)).to.throw();
    });

    it("should fail to decrypt corrupted ciphertext", function () {
      const plaintext = "SECRET=value";
      const key = generateAesKeyNode();

      const encrypted = aesEncryptNode(plaintext, key);
      const corrupted = encrypted.slice(0, -10) + "corrupted";

      expect(() => aesDecryptNode(corrupted, key)).to.throw();
    });
  });

  describe("splitAesKeyToUint128Node and joinUint128ToAesKeyNode", function () {
    it("should split a 32-byte key into two uint128 values", function () {
      const key = generateAesKeyNode();
      const [high, low] = splitAesKeyToUint128Node(key);

      expect(typeof high).to.equal("bigint");
      expect(typeof low).to.equal("bigint");
      expect(high >= 0n).to.be.true;
      expect(low >= 0n).to.be.true;
    });

    it("should rejoin split key to original", function () {
      const key = generateAesKeyNode();
      const [high, low] = splitAesKeyToUint128Node(key);
      const rejoined = joinUint128ToAesKeyNode(high, low);

      expect(rejoined).to.deep.equal(key);
    });

    it("should handle deterministic key values", function () {
      const key = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        key[i] = i;
      }

      const [high, low] = splitAesKeyToUint128Node(key);
      const rejoined = joinUint128ToAesKeyNode(high, low);

      expect(rejoined).to.deep.equal(key);
    });

    it("should handle edge case of all zeros", function () {
      const key = Buffer.alloc(32, 0);
      const [high, low] = splitAesKeyToUint128Node(key);

      expect(high.toString()).to.equal("0");
      expect(low.toString()).to.equal("0");

      const rejoined = joinUint128ToAesKeyNode(high, low);
      expect(rejoined).to.deep.equal(key);
    });

    it("should handle edge case of all 0xFF", function () {
      const key = Buffer.alloc(32, 0xff);
      const [high, low] = splitAesKeyToUint128Node(key);

      expect(high.toString()).to.equal("340282366920938463463374607431768211455");
      expect(low.toString()).to.equal("340282366920938463463374607431768211455");

      const rejoined = joinUint128ToAesKeyNode(high, low);
      expect(rejoined).to.deep.equal(key);
    });

    it("should preserve exact byte order through round-trip", function () {
      const testKeys = [
        Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"),
        Buffer.from("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", "hex"),
        Buffer.from("DEADBEEFCAFEBABE1234567890ABCDEF00000000000000000000000000000000", "hex"),
        generateAesKeyNode(),
      ];

      for (const key of testKeys) {
        const [high, low] = splitAesKeyToUint128Node(key);
        const rejoined = joinUint128ToAesKeyNode(high, low);
        expect(rejoined).to.deep.equal(key);
      }
    });
  });

  describe("end-to-end encryption workflow", function () {
    it("should complete full workflow: generate -> encrypt -> split -> join -> decrypt", function () {
      const plaintext = "DATABASE_URL=postgres://user:pass@localhost/db\nAPI_KEY=sk-1234567890";

      // Generate key
      const aesKey = generateAesKeyNode();

      // Encrypt
      const encrypted = aesEncryptNode(plaintext, aesKey);

      // Split for FHE
      const [high, low] = splitAesKeyToUint128Node(aesKey);

      // Rejoin after FHE decryption
      const rejoinedKey = joinUint128ToAesKeyNode(high, low);

      // Decrypt
      const decrypted = aesDecryptNode(encrypted, rejoinedKey);

      expect(decrypted).to.equal(plaintext);
    });
  });
});
