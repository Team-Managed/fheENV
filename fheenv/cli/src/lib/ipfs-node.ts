import FormData from "form-data";
import axios from "axios";

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function uploadToIPFSNode(
  content: string,
  name: string,
  jwt: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", Buffer.from(content), { filename: name });
  formData.append("pinataMetadata", JSON.stringify({ name: `fheenv-${name}` }));
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${jwt}`,
      },
    }
  );
  return res.data.IpfsHash as string;
}

export async function fetchFromIPFSNode(cid: string): Promise<string> {
  const res = await axios.get(`${PINATA_GATEWAY}/${cid}`, {
    responseType: "text",
  });
  return res.data as string;
}
