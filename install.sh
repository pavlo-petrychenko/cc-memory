#!/usr/bin/env bash
# cc-memory one-line installer. Idempotent; safe to re-run.
#   ./install.sh
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$REPO/tools/install.py" "$@"
