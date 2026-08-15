#!/usr/bin/env bash
# cc-memory installer. Idempotent; safe to re-run after a `git pull`.
#
#   ./install.sh              install (or refresh) the wiring
#   ./install.sh --dry-run    print the settings.json diff and change nothing
#
# Builds the bundle first, because the installed shim and every registered hook
# point at dist/memory.js by absolute path — installing without a fresh build
# would wire Claude Code to stale code.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

if ! command -v bun >/dev/null 2>&1; then
  echo "cc-memory needs bun on PATH: https://bun.com/docs/installation" >&2
  exit 1
fi

bun install --frozen-lockfile
bun run build
exec bun dist/memory.js install "$@"
