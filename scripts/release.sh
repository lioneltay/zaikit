#!/usr/bin/env bash
set -euo pipefail

PACKAGES=(
  packages/utils/package.json
  packages/memory/package.json
  packages/memory-inmemory/package.json
  packages/memory-postgres/package.json
  packages/core/package.json
  packages/react/package.json
  packages/codegen-react/package.json
  packages/sandbox/package.json
)

# Read current version from core
CURRENT=$(node -p "require('./packages/core/package.json').version")
echo "Current version: $CURRENT"

if [ -n "${1:-}" ]; then
  NEXT="$1"
else
  # Bump patch
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  NEXT="$MAJOR.$MINOR.$((PATCH + 1))"
fi

echo "Next version:    $NEXT"
echo ""

# Update versions in all publishable packages
for pkg in "${PACKAGES[@]}"; do
  node -e "
    const fs = require('fs');
    const json = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
    json.version = '$NEXT';
    fs.writeFileSync('$pkg', JSON.stringify(json, null, 2) + '\n');
  "
  echo "Updated $pkg → $NEXT"
done

echo ""
echo "Running build, lint, and type-check..."
pnpm build && pnpm lint && pnpm check-types

echo ""
echo "Committing and tagging..."
git add "${PACKAGES[@]}"
git commit -m "release: v$NEXT"
git tag "v$NEXT"

echo ""
echo "Publishing packages..."
for pkg in "${PACKAGES[@]}"; do
  DIR=$(dirname "$pkg")
  echo "Publishing $(node -p "require('./$pkg').name")@$NEXT"
  (cd "$DIR" && pnpm publish --access public)
done

echo ""
echo "Pushing..."
git push --follow-tags

echo ""
echo "Done! Released v$NEXT"
