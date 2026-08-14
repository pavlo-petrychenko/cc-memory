#!/usr/bin/env bash
# cc-memory one-line installer. Idempotent; safe to re-run.
#   ./install.sh [--dry-run]
#
# TypeScript/Bun port of the old `python3 tools/install.py` entry point
# ([[packet-9-install]]): build the bundle, then let `memory install` (the
# real installer logic, `src/services/install/**`) do the actual work.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

if ! command -v bun >/dev/null 2>&1; then
  echo "cc-memory requires bun (https://bun.sh) — not found on PATH." >&2
  exit 1
fi

bun install
bun run build
exec bun dist/memory.js install "$@"
