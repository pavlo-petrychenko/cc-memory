import type { RawWorkspace } from "@/core/index.ts";
import { REGISTRY_HEADER } from "@/workspace/serializers/registryToml/registryToml.constants.ts";

/** Escapes backslashes then double quotes, nothing else — a control character in
 * a path would produce invalid TOML, but paths never contain one in practice. */
function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Comma-separated, quoted; no spaces inside the outer brackets. */
function quotedArray(items: readonly string[]): string {
  return `[${items.map(quote).join(", ")}]`;
}

/** Deliberately does NOT use `smol-toml`'s stringifier: this file is user-owned
 * and rewritten in place on every `memory workspace add|rm`, so its exact
 * formatting must stay stable — a stringifier's own choices would show up as
 * spurious churn in the user's registry. `smol-toml` is still used for reading. */
export class RegistryTomlSerializer {
  serialize(workspaces: readonly RawWorkspace[]): string {
    if (workspaces.length === 0) return REGISTRY_HEADER;

    const blocks = workspaces.map((workspace) =>
      [
        "[[workspace]]",
        `id = ${quote(workspace.id)}`,
        `match = ${quotedArray(workspace.match)}`,
        `kb = ${quote(workspace.kb)}`,
        `worklogs = ${quote(workspace.worklogs)}`,
        `exclude = ${quotedArray(workspace.exclude)}`,
        `index_db = ${quote(workspace.indexDb)}`,
      ].join("\n"),
    );

    return `${REGISTRY_HEADER}${blocks.join("\n\n")}\n`;
  }
}
