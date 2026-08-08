#!/usr/bin/env bash
# Build the demo and docs static exports into a single GitHub Pages artifact.
# Demo lives at /${repo}/ and docs at /${repo}/docs/.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

repo_base="${NEXT_PUBLIC_BASE_PATH:-/Weavo}"
demo_base="$repo_base"
docs_base="${repo_base}/docs"
staging="${root}/.pages"

export NEXT_STATIC_EXPORT=1

echo "Building demo (basePath=${demo_base})…"
NEXT_PUBLIC_BASE_PATH="$demo_base" bun run --filter=demo build:pages

echo "Building docs (basePath=${docs_base})…"
NEXT_PUBLIC_BASE_PATH="$docs_base" bun run --filter=docs build:pages

rm -rf "$staging"
mkdir -p "$staging/docs"
cp -R apps/demo/out/. "$staging/"
cp -R apps/docs/out/. "$staging/docs/"
touch "$staging/.nojekyll"

echo "Pages artifact ready at .pages/ (demo + docs)."
