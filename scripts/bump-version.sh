#!/usr/bin/env bash
set -euo pipefail

# Bump version across all config files
# Usage: ./scripts/bump-version.sh <new-version>
# Example: ./scripts/bump-version.sh 0.2.0

NEW_VERSION="${1:?Usage: bump-version.sh <version>}"

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: Invalid semver: $NEW_VERSION"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/packages/desktop"

# 1. package.json
cd "$DESKTOP"
npm pkg set version="$NEW_VERSION"

# 2. Cargo.toml + 3. tauri.conf.json
node -e "
  const fs = require('fs');

  // Cargo.toml: replace first version = line
  const cargoPath = '$DESKTOP/src-tauri/Cargo.toml';
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version = \".*\"/m, 'version = \"$NEW_VERSION\"');
  fs.writeFileSync(cargoPath, cargo);

  // tauri.conf.json
  const confPath = '$DESKTOP/src-tauri/tauri.conf.json';
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
  conf.version = '$NEW_VERSION';
  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
"

echo "Version bumped to $NEW_VERSION in:"
echo "  - packages/desktop/package.json"
echo "  - packages/desktop/src-tauri/Cargo.toml"
echo "  - packages/desktop/src-tauri/tauri.conf.json"

# CHANGELOG generation (optional)
if command -v git-cliff &>/dev/null; then
  git-cliff --tag "v$NEW_VERSION" -o "$ROOT/CHANGELOG.md"
  echo "  - CHANGELOG.md updated"
else
  echo ""
  echo "Hint: Install git-cliff for automatic CHANGELOG generation"
  echo "  brew install git-cliff"
fi
