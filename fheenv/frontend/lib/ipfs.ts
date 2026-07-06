const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function uploadToIPFS(
  content: string,
  name: string,
): Promise<string> {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", blob, name);
  formData.append("name", name);

  const res = await fetch("/api/ipfs", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`IPFS upload failed: ${err.error || res.statusText}`);
  }
  const data = await res.json();
  return data.cid as string;
}

export async function fetchFromIPFS(cid: string): Promise<string> {
  const res = await fetch(`${PINATA_GATEWAY}/${cid}`);
  if (!res.ok)
    throw new Error(`IPFS fetch failed for CID ${cid}: ${res.statusText}`);
  return res.text();
}
