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
# CI builds from the tagged commit, so check that rather than the working tree.
docs_version=$(git show "HEAD:$docs_json" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")
if [ "$docs_version" != "$version" ]; then
  echo "Version mismatch: HEAD has ${docs_version}, tag requests ${version}" >&2
  echo "Commit the version bump before tagging." >&2
  exit 1
fi

tag="docs@${version}"

git tag "$tag"
git push origin "$tag"

echo "Pushed $tag — CI will deploy docs (with the demo) to GitHub Pages."
