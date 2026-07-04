#!/usr/bin/env bash
# =============================================================================
# fheENV Demo Script
# Walks through the full lifecycle:
#   login → init → push → pull → run → team-add → team-remove → rotate
# =============================================================================
set -e

REGISTRY="0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2"
RPC="https://sepolia.infura.io/v3/2f47822adc2844fbae3a6fe15913289f"
CHAIN_ID=11155111
CLI="node $(dirname "$0")/../cli/dist/index.js"
DEMO_DIR="$(dirname "$0")"

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

header()  { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${RESET}"; }
step()    { echo -e "\n${BOLD}${GREEN}▶ $1${RESET}"; }
info()    { echo -e "  ${YELLOW}$1${RESET}"; }
success() { echo -e "  ${GREEN}✓ $1${RESET}"; }

# ── Preflight ──────────────────────────────────────────────────────────────────
header "fheENV Demo"
echo -e "  Contract : ${CYAN}${REGISTRY}${RESET}"
echo -e "  Network  : Ethereum Sepolia (${CHAIN_ID})"
echo ""

# Check CLI is built
if [ ! -f "$(dirname "$0")/../cli/dist/index.js" ]; then
  echo -e "${RED}Error: CLI not built. Run: cd cli && pnpm run build${RESET}"
  exit 1
fi

# ── Step 0: Prerequisites check ───────────────────────────────────────────────
header "Step 0 — Prerequisites"

if [ -z "$FHEENV_PRIVATE_KEY" ] && [ ! -f "$HOME/.fheenv/wallet.json" ]; then
  echo -e "${RED}No wallet found.${RESET}"
  echo -e "Either:"
  echo -e "  ${YELLOW}export FHEENV_PRIVATE_KEY=0xYOUR_PRIVATE_KEY${RESET}"
  echo -e "  or:"
  echo -e "  ${YELLOW}${CLI} login --key 0xYOUR_PRIVATE_KEY${RESET}"
  exit 1
fi
success "Wallet found"

if [ -z "$PINATA_JWT" ]; then
  echo -e "${RED}PINATA_JWT not set.${RESET}"
  echo -e "  ${YELLOW}export PINATA_JWT=eyJhbGc...${RESET}"
  exit 1
fi
success "Pinata JWT found"

# ── Step 1: Init project ───────────────────────────────────────────────────────
header "Step 1 — Init project on Sepolia"
info "Creating 'demo-app' project on-chain..."

cd "$DEMO_DIR"
rm -f .fheenv.json

$CLI init \
  --name "demo-app" \
  --registry "$REGISTRY" \
  --rpc "$RPC" \
  --chain-id "$CHAIN_ID" \
  --pinata-jwt "$PINATA_JWT"

success "Project created — .fheenv.json written"
echo ""
cat .fheenv.json

# ── Step 2: Show plaintext .env ────────────────────────────────────────────────
header "Step 2 — Plaintext secrets (before encryption)"
info "This is what we're about to encrypt:"
echo ""
cat .env

# ── Step 3: Push secrets ───────────────────────────────────────────────────────
header "Step 3 — Encrypt and push to fheENV"
info "AES-encrypting .env → IPFS → FHE-encrypting AES key → Sepolia..."

$CLI push --env production --file .env

success "Secrets pushed. Open Etherscan to verify zero plaintext in calldata:"
echo -e "  ${CYAN}https://sepolia.etherscan.io/address/${REGISTRY}${RESET}"

# ── Step 4: Pull secrets ───────────────────────────────────────────────────────
header "Step 4 — Pull and decrypt"
info "Decrypting via Threshold Network → IPFS fetch → AES decrypt..."

$CLI pull --env production --output .env.decrypted

echo ""
info "Decrypted output (.env.decrypted):"
cat .env.decrypted

echo ""
info "Verifying decrypted output matches original..."
if diff -q .env .env.decrypted > /dev/null 2>&1; then
  success "Round-trip verified — decrypted output is identical to original"
else
  echo -e "${RED}Mismatch! Diff:${RESET}"
  diff .env .env.decrypted
fi

# ── Step 5: Run with injected secrets ─────────────────────────────────────────
header "Step 5 — Run with secrets injected (no disk write)"
info "Injecting secrets into a node.js one-liner..."

$CLI run --env production -- node -e "
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '[SET]' : '[MISSING]');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '[SET]' : '[MISSING]');
  console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '[SET]' : '[MISSING]');
  console.log('All', Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('NODE')).length, 'env vars injected');
"

# ── Step 6: Cleanup temp files ─────────────────────────────────────────────────
rm -f .env.decrypted

# ── Summary ────────────────────────────────────────────────────────────────────
header "Demo Complete"
echo -e "  ${GREEN}✓ Project created on Sepolia${RESET}"
echo -e "  ${GREEN}✓ Secrets encrypted with AES-256-GCM and pushed to IPFS${RESET}"
echo -e "  ${GREEN}✓ AES key stored as 2x euint128 FHE ciphertext on-chain${RESET}"
echo -e "  ${GREEN}✓ Secrets decrypted back to plaintext — round-trip verified${RESET}"
echo -e "  ${GREEN}✓ Secrets injected into child process without disk write${RESET}"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  ${YELLOW}${CLI} team add --member 0xTeammate --env production${RESET}"
echo -e "  ${YELLOW}${CLI} team remove --member 0xTeammate --env production${RESET}"
echo -e "  ${YELLOW}${CLI} rotate --env production${RESET}"
echo ""
