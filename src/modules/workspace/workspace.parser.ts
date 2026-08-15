import { parse as parseToml } from "smol-toml";
import type { TomlTable, TomlValue } from "smol-toml";

import type { RawWorkspace } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import {
  type RegistryError,
  RegistryErrorKind,
} from "@/modules/workspace/workspace.typedefs.ts";

function malformed(message: string): Result<RawWorkspace, RegistryError> {
  return { ok: false, error: { kind: RegistryErrorKind.Malformed, message } };
}

// `typeof` can't distinguish a TOML domain value from a plain object (a `TomlDate`
// is also `"object"`) — `Object.prototype.toString` gives the precise tag instead.
function isTomlString(value: TomlValue | undefined): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isTomlStringArray(value: TomlValue | undefined): value is string[] {
  return Array.isArray(value) && value.every(isTomlString);
}

function isTomlTableValue(value: TomlValue): value is TomlTable {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function parseRawWorkspaceEntry(
  entry: TomlValue,
  index: number,
): Result<RawWorkspace, RegistryError> {
  if (!isTomlTableValue(entry)) {
    return malformed(`workspace[${index}] must be a table`);
  }
  const table: TomlTable = entry;
  const id = table["id"];
  const match = table["match"];
  const kb = table["kb"];
  const worklogs = table["worklogs"];
  const indexDb = table["index_db"];
  const exclude = table["exclude"];

  if (!isTomlString(id)) return malformed(`workspace[${index}].id must be a string`);
  if (!isTomlStringArray(match)) {
    return malformed(`workspace[${index}].match must be an array of strings`);
  }
  if (!isTomlString(kb)) return malformed(`workspace[${index}].kb must be a string`);
  if (!isTomlString(worklogs)) {
    return malformed(`workspace[${index}].worklogs must be a string`);
  }
  if (!isTomlString(indexDb)) {
    return malformed(`workspace[${index}].index_db must be a string`);
  }
  if (exclude !== undefined && !isTomlStringArray(exclude)) {
    return malformed(`workspace[${index}].exclude must be an array of strings`);
  }

  return {
    ok: true,
    value: { id, match, kb, worklogs, exclude: exclude ?? [], indexDb },
  };
}

/** Parses the CONTENTS of a `registry.toml` file (already read by the
 * repository) into raw workspaces. A missing `[[workspace]]` key is an empty
 * list, not an error. */
export class WorkspaceParser {
  parse(content: string): Result<readonly RawWorkspace[], RegistryError> {
    let parsed: TomlTable;
    try {
      parsed = parseToml(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { kind: RegistryErrorKind.ParseError, message } };
    }

    const workspaceValue = parsed["workspace"];
    if (workspaceValue === undefined) return { ok: true, value: [] };
    if (!Array.isArray(workspaceValue)) {
      return {
        ok: false,
        error: {
          kind: RegistryErrorKind.Malformed,
          message: "'workspace' must be an array of tables",
        },
      };
    }

    const workspaces: RawWorkspace[] = [];
    for (const [index, entry] of workspaceValue.entries()) {
      const result = parseRawWorkspaceEntry(entry, index);
      if (!result.ok) return result;
      workspaces.push(result.value);
    }
    return { ok: true, value: workspaces };
  }
}
