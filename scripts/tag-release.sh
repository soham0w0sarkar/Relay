#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ -z "$version" ]]; then
  echo "Usage: bun run tag-release <version>" >&2
  echo "Example: bun run tag-release 1.2.1" >&2
  exit 1
fi

tag="v${version#v}"

git tag "$tag"
git push origin "$tag"

echo "Pushed $tag — CI will publish npm packages and deploy the demo."
