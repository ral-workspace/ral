#!/usr/bin/env bash
set -euo pipefail

# Download Python and Node.js runtimes for bundling with Helm
# Usage: ./scripts/download-runtimes.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="${SCRIPT_DIR}/../src-tauri/resources"

# Versions
PYTHON_VERSION="3.12.13"
PYTHON_RELEASE_TAG="20260303"
NODE_VERSION="22.15.0"

# Detect platform
ARCH="$(uname -m)"
OS="$(uname -s)"

# ─── Python ───

case "${OS}-${ARCH}" in
  Darwin-arm64)  PY_TRIPLE="aarch64-apple-darwin" ;;
  Darwin-x86_64) PY_TRIPLE="x86_64-apple-darwin" ;;
  Linux-x86_64)  PY_TRIPLE="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64) PY_TRIPLE="aarch64-unknown-linux-gnu" ;;
  *)
    echo "Unsupported platform: ${OS}-${ARCH}"
    exit 1
    ;;
esac

PY_DEST="${RESOURCES_DIR}/python"
PY_FILENAME="cpython-${PYTHON_VERSION}+${PYTHON_RELEASE_TAG}-${PY_TRIPLE}-install_only_stripped.tar.gz"
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE_TAG}/${PY_FILENAME}"

echo "=== Downloading Python ${PYTHON_VERSION} ==="
rm -rf "${PY_DEST}"
mkdir -p "${PY_DEST}"

TMPFILE="$(mktemp)"
trap 'rm -f "${TMPFILE}"' EXIT

curl -fSL "${PY_URL}" -o "${TMPFILE}"
tar -xzf "${TMPFILE}" -C "${PY_DEST}" --strip-components=1
echo "Python: $("${PY_DEST}/bin/python3" --version)"

# ─── Node.js ───

case "${OS}-${ARCH}" in
  Darwin-arm64)  NODE_PLATFORM="darwin-arm64" ;;
  Darwin-x86_64) NODE_PLATFORM="darwin-x64" ;;
  Linux-x86_64)  NODE_PLATFORM="linux-x64" ;;
  Linux-aarch64) NODE_PLATFORM="linux-arm64" ;;
esac

NODE_DEST="${RESOURCES_DIR}/node"
NODE_FILENAME="node-v${NODE_VERSION}-${NODE_PLATFORM}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILENAME}"

echo "=== Downloading Node.js ${NODE_VERSION} ==="
rm -rf "${NODE_DEST}"
mkdir -p "${NODE_DEST}"

curl -fSL "${NODE_URL}" -o "${TMPFILE}"
tar -xzf "${TMPFILE}" -C "${NODE_DEST}" --strip-components=1
echo "Node.js: $("${NODE_DEST}/bin/node" --version)"

echo "=== Done ==="
