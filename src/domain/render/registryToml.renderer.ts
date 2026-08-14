import { stringify } from "smol-toml";

import type { RawWorkspace } from "../Workspace.ts";

/**
 * Serializes the workspace registry (C1) — replaces the hand-rolled `_q`/`_arr`
 * escaping in `lib/registry.py:60-85` with `smol-toml`'s stringifier, while
 * keeping the header comment and field order byte-for-byte (`registry.py:71-85`).
 * Value formatting (quoting, array bracket spacing) is `smol-toml`'s own —
 * this file is only responsible for the header and the field order/names,
 * `index_db` included (the on-disk key is snake_case even though the domain
 * type is `indexDb`).
 */
const REGISTRY_HEADER =
  "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
  "# Paths may use ~; they are expanded at load time. One block per workspace.\n\n";

export function serializeRegistry(workspaces: readonly RawWorkspace[]): string {
  if (workspaces.length === 0) return REGISTRY_HEADER;
  const tables = workspaces.map((workspace) => ({
    id: workspace.id,
    match: [...workspace.match],
    kb: workspace.kb,
    worklogs: workspace.worklogs,
    exclude: [...workspace.exclude],
    index_db: workspace.indexDb,
  }));
  return REGISTRY_HEADER + stringify({ workspace: tables });
}
