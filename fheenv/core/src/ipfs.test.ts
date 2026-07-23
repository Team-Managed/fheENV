/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect } from "chai";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { uploadToIPFSNode, fetchFromIPFSNode, unpinFromIPFSNode } from "./ipfs";

describe("IPFS Operations", function () {
  let mock: any;

  beforeEach(function () {
    mock = new MockAdapter(axios);
  });

  afterEach(function () {
    mock.restore();
  });

  describe("uploadToIPFSNode", function () {
    it("should upload content to Pinata and return CID", async function () {
      const content = "DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret";
      const name = "production";
      const jwt = "test-jwt-token";
      const expectedCid = "QmTestCID123456789";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: expectedCid,
      });

      const cid = await uploadToIPFSNode(content, name, jwt);

      expect(cid).to.equal(expectedCid);

      const request = mock.history.post[0];
      expect(request.headers.Authorization).to.equal(`Bearer ${jwt}`);
      expect(request.data).to.be.ok;
    });

    it("should include proper metadata in upload", async function () {
      const content = "TEST=value";
      const name = "staging";
      const jwt = "test-jwt";
      const expectedCid = "QmTestCID";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: expectedCid,
      });

      await uploadToIPFSNode(content, name, jwt);

      const request = mock.history.post[0];
      // The FormData should include pinataMetadata with the name
      expect(request.data).to.be.ok;
    });

    it("should handle large content uploads", async function () {
      const largeContent = "A".repeat(1000000); // 1MB
      const jwt = "test-jwt";
      const expectedCid = "QmLargeContentCID";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: expectedCid,
      });

      const cid = await uploadToIPFSNode(largeContent, "large", jwt);

      expect(cid).to.equal(expectedCid);
    });

    it("should handle special characters in content", async function () {
      const content = "KEY=!@#$%^&*()_+-=[]{}|;':\",./<>?\nNEWLINE\tTAB";
      const jwt = "test-jwt";
      const expectedCid = "QmSpecialCharsCID";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: expectedCid,
      });

      const cid = await uploadToIPFSNode(content, "special", jwt);

      expect(cid).to.equal(expectedCid);
    });

    it("should handle unicode content", async function () {
      const content = "KEY=こんにちは\nKEY2=Привет\nKEY3=مرحبا";
      const jwt = "test-jwt";
      const expectedCid = "QmUnicodeCID";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: expectedCid,
      });

      const cid = await uploadToIPFSNode(content, "unicode", jwt);

      expect(cid).to.equal(expectedCid);
    });

    it("should throw on authentication error", async function () {
      const content = "TEST=value";
      const jwt = "invalid-jwt";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(401, {
        error: "Unauthorized",
      });

      try {
        await uploadToIPFSNode(content, "test", jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(401);
      }
    });

    it("should throw on server error", async function () {
      const content = "TEST=value";
      const jwt = "test-jwt";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(500, {
        error: "Internal Server Error",
      });

      try {
        await uploadToIPFSNode(content, "test", jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(500);
      }
    });

    it("should throw on network error", async function () {
      const content = "TEST=value";
      const jwt = "test-jwt";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").networkError();

      try {
        await uploadToIPFSNode(content, "test", jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Network Error");
      }
    });

    it("should handle rate limiting", async function () {
      const content = "TEST=value";
      const jwt = "test-jwt";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(429, {
        error: "Too Many Requests",
      });

      try {
        await uploadToIPFSNode(content, "test", jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(429);
      }
    });
  });

  describe("fetchFromIPFSNode", function () {
    it("should fetch content from Pinata gateway", async function () {
      const cid = "QmTestCID123";
      const expectedContent = "DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(200, expectedContent);

      const content = await fetchFromIPFSNode(cid);

      expect(content).to.equal(expectedContent);
    });

    it("should handle large content fetches", async function () {
      const cid = "QmLargeCID";
      const largeContent = "A".repeat(1000000); // 1MB

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(200, largeContent);

      const content = await fetchFromIPFSNode(cid);

      expect(content).to.equal(largeContent);
      expect(content.length).to.equal(1000000);
    });

    it("should handle special characters in fetched content", async function () {
      const cid = "QmSpecialCID";
      const content = "KEY=!@#$%^&*()_+-=[]{}|;':\",./<>?";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(200, content);

      const fetched = await fetchFromIPFSNode(cid);

      expect(fetched).to.equal(content);
    });

    it("should handle unicode content", async function () {
      const cid = "QmUnicodeCID";
      const content = "KEY=こんにちは\nKEY2=Привет\nKEY3=مرحبا";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(200, content);

      const fetched = await fetchFromIPFSNode(cid);

      expect(fetched).to.equal(content);
    });

    it("should handle empty content", async function () {
      const cid = "QmEmptyCID";
      const content = "";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(200, content);

      const fetched = await fetchFromIPFSNode(cid);

      expect(fetched).to.equal("");
    });

    it("should throw on 404 not found", async function () {
      const cid = "QmNonExistentCID";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(404, {
        error: "Not Found",
      });

      try {
        await fetchFromIPFSNode(cid);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(404);
      }
    });

    it("should throw on gateway timeout", async function () {
      const cid = "QmTimeoutCID";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).timeout();

      try {
        await fetchFromIPFSNode(cid);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).to.equal("ECONNABORTED");
      }
    });

    it("should throw on network error", async function () {
      const cid = "QmNetworkErrorCID";

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).networkError();

      try {
        await fetchFromIPFSNode(cid);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Network Error");
      }
    });
  });

  describe("unpinFromIPFSNode", function () {
    it("should unpin content from Pinata", async function () {
      const cid = "QmTestCID";
      const jwt = "test-jwt";

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).reply(200, {
        message: "Unpinned successfully",
      });

      await unpinFromIPFSNode(cid, jwt);

      const request = mock.history.delete[0];
      expect(request.headers.Authorization).to.equal(`Bearer ${jwt}`);
    });

    it("should handle successful unpin with no response body", async function () {
      const cid = "QmTestCID";
      const jwt = "test-jwt";

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).reply(200);

      await unpinFromIPFSNode(cid, jwt);

      // Should not throw
      expect(true).to.be.true;
    });

    it("should throw on authentication error", async function () {
      const cid = "QmTestCID";
      const jwt = "invalid-jwt";

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).reply(401, {
        error: "Unauthorized",
      });

      try {
        await unpinFromIPFSNode(cid, jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(401);
      }
    });

    it("should throw when trying to unpin non-existent CID", async function () {
      const cid = "QmNonExistentCID";
      const jwt = "test-jwt";

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).reply(404, {
        error: "CID not found or not pinned",
      });

      try {
        await unpinFromIPFSNode(cid, jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(404);
      }
    });

    it("should throw on server error", async function () {
      const cid = "QmTestCID";
      const jwt = "test-jwt";

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).reply(500, {
        error: "Internal Server Error",
      });

      try {
        await unpinFromIPFSNode(cid, jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.response.status).to.equal(500);
      }
    });

    it("should throw on network error", async function () {
      const cid = "QmTestCID";
      const jwt = "test-jwt";

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).networkError();

      try {
        await unpinFromIPFSNode(cid, jwt);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Network Error");
      }
    });
  });

  describe("integration scenarios", function () {
    it("should handle upload then fetch workflow", async function () {
      const content = "DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret";
      const jwt = "test-jwt";
      const cid = "QmTestCID123";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: cid,
      });

      mock.onGet(`https://gateway.pinata.cloud/ipfs/${cid}`).reply(200, content);

      const uploadedCid = await uploadToIPFSNode(content, "test", jwt);
      const fetchedContent = await fetchFromIPFSNode(uploadedCid);

      expect(fetchedContent).to.equal(content);
    });

    it("should handle upload then unpin workflow", async function () {
      const content = "TEST=value";
      const jwt = "test-jwt";
      const cid = "QmTestCID123";

      mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").reply(200, {
        IpfsHash: cid,
      });

      mock.onDelete(`https://api.pinata.cloud/pinning/unpin/${cid}`).reply(200, {
        message: "Unpinned successfully",
      });

      const uploadedCid = await uploadToIPFSNode(content, "test", jwt);
      await unpinFromIPFSNode(uploadedCid, jwt);

      expect(uploadedCid).to.equal(cid);
    });

    it("should handle multiple sequential uploads", async function () {
      const jwt = "test-jwt";
      const contents = ["ENV1=value1", "ENV2=value2", "ENV3=value3"];
      const cids = ["QmCID1", "QmCID2", "QmCID3"];

      contents.forEach((content, i) => {
        mock.onPost("https://api.pinata.cloud/pinning/pinFileToIPFS").replyOnce(200, {
          IpfsHash: cids[i],
        });
      });

      const uploadedCids: any[] = [];
      for (const content of contents) {
        const cid = await uploadToIPFSNode(content, `env${uploadedCids.length}`, jwt);
        uploadedCids.push(cid);
      }

      expect(uploadedCids).to.deep.equal(cids);
    });
  });
});
