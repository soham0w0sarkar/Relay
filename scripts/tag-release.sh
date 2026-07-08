#!/usr/bin/env bash
set -euo pipefail

VALID_PKGS=(core sync transport client)

usage() {
  echo "Usage: bun run tag-release <package> <version> [<package> <version> ...]" >&2
  echo "Packages: ${VALID_PKGS[*]}" >&2
  echo "Example: bun run tag-release core 1.2.3 client 1.2.3" >&2
  echo "Tags: weavo-core@1.2.3, weavo-client@1.2.3" >&2
}

if [ $# -lt 2 ] || [ $(($# % 2)) -ne 0 ]; then
  usage
  exit 1
fi

is_valid_pkg() {
  local name="$1"
  for p in "${VALID_PKGS[@]}"; do
    [ "$p" = "$name" ] && return 0
  done
  return 1
}

while [ $# -gt 0 ]; do
  pkg="$1"
  version="${2#v}"
  shift 2

  if ! is_valid_pkg "$pkg"; then
    echo "Unknown package: $pkg" >&2
    usage
    exit 1
  fi

  pkg_json="packages/${pkg}/package.json"
  pkg_version=$(node -p "require('./$pkg_json').version")
  if [ "$pkg_version" != "$version" ]; then
    echo "Version mismatch for @weavo/${pkg}: package.json has ${pkg_version}, tag requests ${version}" >&2
    exit 1
  fi

  tag="weavo-${pkg}@${version}"
  git tag "$tag"
  git push origin "$tag"
  echo "Pushed $tag — CI will publish @weavo/${pkg}@${version} to npm."
done
