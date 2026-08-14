import type { RawWorkspace } from "../core/Workspace.ts";

/**
 * Serializes the workspace registry (C1) — a port of `lib/registry.py:60-85`.
 *
 * This deliberately does NOT use `smol-toml`'s stringifier: it emits arrays as
 * `[ "a", "b" ]` (inner spaces), where Python's `_arr` emits `["a", "b"]`. C1
 * requires byte-identical output, because this file is user-owned and every
 * `memory workspace add|rm` rewrites it — a formatting drift would show up as
 * spurious churn in the user's registry. Verified by diffing this function's output
 * against `registry.dumps()` on the real `~/.claude/memory/registry.toml`.
 *
 * `smol-toml` is still used for READING the registry (P4's service), which is where
 * a real parser actually earns its place; writing our fixed six-field schema does
 * not need one.
 */
const REGISTRY_HEADER =
  "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
  "# Paths may use ~; they are expanded at load time. One block per workspace.\n\n";

/**
 * Python's `_q` (`registry.py:60-61`): wrap in double quotes, escaping backslashes
 * then double quotes — and nothing else. Reproduced exactly, limitations included:
 * a control character (a newline in a path, say) would be emitted raw and produce
 * invalid TOML in both implementations. Paths never contain one in practice, and
 * diverging here would break the byte-identical guarantee.
 */
function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Python's `_arr` (`registry.py:64-65`) — note: no spaces inside the brackets. */
function quotedArray(items: readonly string[]): string {
  return `[${items.map(quote).join(", ")}]`;
}

export function serializeRegistry(workspaces: readonly RawWorkspace[]): string {
  if (workspaces.length === 0) return REGISTRY_HEADER;

  const blocks = workspaces.map((workspace) =>
    [
      "[[workspace]]",
      `id = ${quote(workspace.id)}`,
      `match = ${quotedArray(workspace.match)}`,
      `kb = ${quote(workspace.kb)}`,
      `worklogs = ${quote(workspace.worklogs)}`,
      `exclude = ${quotedArray(workspace.exclude)}`,
      // The on-disk key stays snake_case even though the domain field is `indexDb`.
      `index_db = ${quote(workspace.indexDb)}`,
    ].join("\n"),
  );

  return `${REGISTRY_HEADER}${blocks.join("\n\n")}\n`;
}
