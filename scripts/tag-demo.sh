#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ -z "$version" ]]; then
  echo "Usage: bun run tag-demo <version>" >&2
  echo "Example: bun run tag-demo 0.1.5" >&2
  exit 1
fi

version="${version#v}"
demo_json="apps/demo/package.json"
# CI builds from the tagged commit, so check that rather than the working tree.
demo_version=$(git show "HEAD:$demo_json" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")
if [ "$demo_version" != "$version" ]; then
  echo "Version mismatch: HEAD has ${demo_version}, tag requests ${version}" >&2
  echo "Commit the version bump before tagging." >&2
  exit 1
fi

tag="demo@${version}"

git tag "$tag"
git push origin "$tag"

echo "Pushed $tag — CI will deploy the demo to GitHub Pages."
