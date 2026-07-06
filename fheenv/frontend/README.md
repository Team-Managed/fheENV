# fheENV — Web Dashboard

The web UI for fheENV. Built with Next.js 14 (App Router), wagmi v2, and viem.

**Live:** [fheenv.vercel.app](https://fheenv.vercel.app)

## Features

- Connect any EVM wallet (MetaMask, Coinbase, etc.)
- Create projects on-chain
- Push encrypted `.env` files (encryption happens in-browser)
- View & edit secrets with FHE decryption via Threshold Network
- Grant/revoke team access
- Full on-chain audit log

## Local Development

```bash
# From the monorepo root (fheenv/)
pnpm install

# Start the frontend dev server
cd frontend
cp .env.example .env.local  # fill in values (see below)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable                       | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | Deployed fheENVRegistry contract address           |
| `NEXT_PUBLIC_CHAIN_ID`         | Chain ID (`11155111` for Sepolia)                  |
| `NEXT_PUBLIC_SEPOLIA_RPC`      | Sepolia RPC endpoint                               |
| `PINATA_JWT`                   | Server-side Pinata JWT (used by `/api/ipfs` route) |

> `PINATA_JWT` is **server-side only** — it's used by the API route at `app/api/ipfs/route.ts` and never exposed to the browser.

## Project Structure

```
app/
├── (landing)/       Landing page (public)
├── (app)/           Dashboard (wallet-gated)
│   ├── dashboard/   Project list
│   └── project/     Project detail + env management
├── api/ipfs/        Server-side IPFS upload proxy
├── layout.tsx       Root layout + fonts
└── providers.tsx    Wagmi + React Query providers

components/
├── landing/         Landing page sections
├── ui/              Reusable UI primitives
├── PushEnvForm.tsx  Push secrets flow
├── SecretsTable.tsx View/edit/decrypt secrets
├── TeamManager.tsx  Grant/revoke access
└── AuditLog.tsx     On-chain event timeline

lib/
├── aes.ts           AES-256-GCM (Web Crypto)
├── cofhe.ts         CoFHE SDK client setup
├── contracts.ts     Registry ABI + address
├── envParser.ts     .env parser/serializer
├── ipfs.ts          IPFS upload via /api/ipfs
└── utils.ts         Tailwind merge helper
```

## Build

```bash
pnpm run build
```

Deployed automatically via Vercel on push to `main`.
