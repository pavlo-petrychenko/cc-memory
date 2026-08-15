import type { RawWorkspace } from "@/core/index.ts";
import { REGISTRY_HEADER } from "@/workspace/serializers/registryToml/registryToml.constants.ts";

/**
 * Wrap in double quotes, escaping backslashes then double quotes — and
 * nothing else. A control character (a newline in a path, say) would be
 * emitted raw and produce invalid TOML. Paths never contain one in practice.
 */
function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Comma-separated, quoted; no spaces inside the outer brackets. */
function quotedArray(items: readonly string[]): string {
  return `[${items.map(quote).join(", ")}]`;
}

/**
 * Serializes the workspace registry.
 *
 * This deliberately does NOT use `smol-toml`'s stringifier: this file is
 * user-owned and every `memory workspace add|rm` rewrites it in place, so its
 * exact formatting must stay stable — a stringifier's own array-formatting
 * choices would show up as spurious churn in the user's registry.
 *
 * `smol-toml` is still used for READING the registry, which is where a real
 * parser actually earns its place; writing our fixed six-field schema does
 * not need one.
 */
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
        // The on-disk key stays snake_case even though the domain field is `indexDb`.
        `index_db = ${quote(workspace.indexDb)}`,
      ].join("\n"),
    );

    return `${REGISTRY_HEADER}${blocks.join("\n\n")}\n`;
  }
}
