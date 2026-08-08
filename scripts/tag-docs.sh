#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ -z "$version" ]]; then
  echo "Usage: bun run tag-docs <version>" >&2
  echo "Example: bun run tag-docs 0.1.0" >&2
  exit 1
fi

version="${version#v}"
docs_json="apps/docs/package.json"
docs_version=$(node -p "require('./$docs_json').version")
if [ "$docs_version" != "$version" ]; then
  echo "Version mismatch: apps/docs/package.json has ${docs_version}, tag requests ${version}" >&2
  exit 1
fi

tag="docs@${version}"

git tag "$tag"
git push origin "$tag"

echo "Pushed $tag — CI will deploy docs (with the demo) to GitHub Pages."
