const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function uploadToIPFS(content: string, name: string): Promise<string> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!jwt) throw new Error("NEXT_PUBLIC_PINATA_JWT not set");

  const blob = new Blob([content], { type: "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", blob, name);
  formData.append("pinataMetadata", JSON.stringify({ name: `fheenv-${name}-${Date.now()}` }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Pinata upload failed: ${res.statusText}`);
  const data = await res.json();
  return data.IpfsHash as string;
}

export async function fetchFromIPFS(cid: string): Promise<string> {
  const res = await fetch(`${PINATA_GATEWAY}/${cid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed for CID ${cid}: ${res.statusText}`);
  return res.text();
}
