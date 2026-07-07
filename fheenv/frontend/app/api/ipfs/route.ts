import { NextRequest, NextResponse } from "next/server";

const PINATA_API = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/**
 * Server-side IPFS upload proxy.
 * Keeps the Pinata JWT on the server — never exposed to the browser.
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json({ error: "PINATA_JWT not configured on server" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string) || "fheenv-blob";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Forward to Pinata
    const pinataForm = new FormData();
    pinataForm.append("file", file, name);
    pinataForm.append("pinataMetadata", JSON.stringify({ name: `fheenv-${name}-${Date.now()}` }));

    const res = await fetch(PINATA_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: pinataForm,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Pinata upload failed: ${res.status} ${text}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json({ cid: data.IpfsHash });
  } catch (err) {
    return NextResponse.json(
      { error: `Upload failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
