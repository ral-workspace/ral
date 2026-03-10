#!/usr/bin/env bash
set -euo pipefail

# Release convenience script
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.0

VERSION="${1:?Usage: release.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT/scripts/bump-version.sh" "$VERSION"

git add -A
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
git push origin main --tags

echo ""
echo "Release v$VERSION triggered. Check GitHub Actions:"
echo "  https://github.com/ral-workspace/anvil/actions"
