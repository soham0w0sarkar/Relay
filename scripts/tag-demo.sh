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
demo_version=$(node -p "require('./$demo_json').version")
if [ "$demo_version" != "$version" ]; then
  echo "Version mismatch: apps/demo/package.json has ${demo_version}, tag requests ${version}" >&2
  exit 1
fi

tag="demo@${version}"

git tag "$tag"
git push origin "$tag"

echo "Pushed $tag — CI will deploy the demo to GitHub Pages."
