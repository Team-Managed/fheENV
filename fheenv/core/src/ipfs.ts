import FormData from "form-data";
import axios from "axios";

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function uploadToIPFSNode(
  content: string,
  name: string,
  jwt: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", Buffer.from(content), { filename: name });
  formData.append("pinataMetadata", JSON.stringify({ name: `fheenv-${name}` }));
  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
    headers: {
      ...formData.getHeaders(),
      Authorization: `Bearer ${jwt}`,
    },
  });
  return res.data.IpfsHash as string;
}

export async function fetchFromIPFSNode(cid: string): Promise<string> {
  const res = await axios.get(`${PINATA_GATEWAY}/${cid}`, {
    responseType: "text",
  });
  return res.data as string;
}

/**
 * Unpin a CID from Pinata-managed IPFS storage.
 *
 * Called after a successful rotation to remove the superseded blob.
 * Note: unpinning removes fheENV's pin — the content may still be
 * replicated on other IPFS nodes if it was fetched while pinned.
 */
export async function unpinFromIPFSNode(cid: string, jwt: string): Promise<void> {
  await axios.delete(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}
