#!/usr/bin/env bash
set -euo pipefail

REPO="Team-Managed/fheENV"
INSTALL_DIR="$HOME/.fheenv/bin"
BINARY_NAME="fheenv"

# ── Detect platform + architecture ───────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)        ASSET="fheenv-macos-arm64" ;;   # Apple Silicon (M1/M2/M3/M4)
      x86_64)       ASSET="fheenv-macos-x64"   ;;   # Intel Mac
      *)            echo "Unsupported macOS arch: $ARCH"; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64)               ASSET="fheenv-linux-x64"   ;;
      aarch64 | arm64)      ASSET="fheenv-linux-arm64"  ;;
      *)                    echo "Unsupported Linux arch: $ARCH"; exit 1 ;;
    esac
    ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

# ── Fetch latest release tag ─────────────────────────────────────────────────
echo "Fetching latest fheenv release..."
LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' \
  | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"

if [ -z "$LATEST_TAG" ]; then
  echo "Error: could not determine latest release tag."
  exit 1
fi

echo "Installing fheenv ${LATEST_TAG} (${ASSET})..."

# ── Download binary ──────────────────────────────────────────────────────────
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${ASSET}"
TMP_FILE="$(mktemp)"

curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"
chmod +x "$TMP_FILE"

# Remove macOS quarantine so Gatekeeper doesn't block the binary after restart
if [ "$OS" = "Darwin" ]; then
  xattr -d com.apple.quarantine "$TMP_FILE" 2>/dev/null || true
fi

# ── Install binary ───────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
mv "$TMP_FILE" "${INSTALL_DIR}/${BINARY_NAME}"

echo "Installed fheenv to ${INSTALL_DIR}/${BINARY_NAME}"

# ── Configure PATH in shell config files ────────────────────────────────────
PATH_LINE='export PATH="$HOME/.fheenv/bin:$PATH"'
COMMENT='# fheenv'

add_to_shell_config() {
  local config_file="$1"
  if [ -f "$config_file" ]; then
    if ! grep -qF '.fheenv/bin' "$config_file"; then
      printf '\n%s\n%s\n' "$COMMENT" "$PATH_LINE" >> "$config_file"
      echo "  Added PATH entry to $config_file"
    else
      echo "  PATH entry already present in $config_file"
    fi
  fi
}

add_to_shell_config "$HOME/.bashrc"
add_to_shell_config "$HOME/.bash_profile"
add_to_shell_config "$HOME/.zshrc"
add_to_shell_config "$HOME/.zprofile"

# ── Also export for the current session ──────────────────────────────────────
export PATH="${INSTALL_DIR}:$PATH"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "fheenv ${LATEST_TAG} installed successfully!"
echo ""
echo "To start using fheenv in your current terminal, run:"
echo ""
echo "    source ~/.zshrc    # zsh (default on macOS)"
echo "    source ~/.bashrc   # bash"
echo ""
echo "Or open a new terminal window."
echo "Then run: fheenv --version"
echo ""
echo "To update fheenv in the future, run:  fheenv update"
