#!/bin/sh
# PostToolUse hook: format, then lint, the single file Claude just wrote.
#
# Formatting is silent (it just happens). Lint problems exit 2 so the finding is fed
# straight back to the agent that wrote the file, instead of surfacing much later in
# `bun run check`.
set -u

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')

# Only our TypeScript sources.
case "$file" in
*.ts) ;;
*) exit 0 ;;
esac
case "$file" in
*/src/* | */tests/* | */tools/*) ;;
*) exit 0 ;;
esac
# The vendored lint plugin is third-party; leave it alone.
case "$file" in
*/tools/oxlint/anti-slop/*) exit 0 ;;
esac
[ -f "$file" ] || exit 0

repo=$(cd "$(dirname "$0")/../.." && pwd)

# Both binaries are run THROUGH bun on purpose: their Node-based TS-config loader
# needs Node >= 22.18, and the default node here is v20. See CLAUDE.md § Toolchain.
bun "$repo/node_modules/.bin/oxfmt" -c "$repo/.oxfmtrc.json" "$file" >/dev/null 2>&1

lint_output=$(bun "$repo/node_modules/.bin/oxlint" -c "$repo/oxlint.config.ts" "$file" 2>&1)
if [ $? -ne 0 ]; then
  printf 'oxlint found problems in %s — fix them now:\n%s\n' "$file" "$lint_output" >&2
  exit 2
fi

exit 0
