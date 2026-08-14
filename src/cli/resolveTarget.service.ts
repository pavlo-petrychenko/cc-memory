import type { AbsPath } from "../core/AbsPath.ts";
import type { Result } from "../core/Result.ts";
import type { RawWorkspace, Workspace } from "../core/Workspace.ts";
import type { FileSystem } from "../platform/fileSystem.port.ts";
import {
  defaultRegistryPath,
  expandWorkspace,
  findWorkspace,
  loadRegistry,
} from "../workspace/registry.service.ts";
import { resolveWorkspace } from "../workspace/resolver.service.ts";
import { type CliOutcome, cliFailure } from "./CliOutcome.ts";

/**
 * Unifies `bin/memory`'s two near-duplicate resolvers — `_targets`
 * (`bin/memory:123-129`, used by `reindex`/`commit`/`reflect`) and `_resolve_ws`
 * (`bin/memory:155-162`, used by `search`/`notes`) — and drops their
 * `x or sys.exit(...)` idiom abuse: both become a `Result` a command can match
 * on and turn into a `CliOutcome` via `cliFailure`, instead of a call that
 * unconditionally terminates the process from inside a resolver.
 */

/** The exact `sys.exit(f"no such workspace: {id}")` text, shared by both
 * resolvers below (`bin/memory:74,127,141,157`). */
export function noSuchWorkspaceMessage(id: string): string {
  return `no such workspace: ${id}`;
}

/** `sys.exit("no workspace for cwd; pass --workspace")` (`bin/memory:145,161`). */
export const NO_WORKSPACE_FOR_CWD_MESSAGE = "no workspace for cwd; pass --workspace";

/**
 * `_targets` (`bin/memory:123-129`): a single workspace by id, or every
 * registered workspace, all expanded — `reindex`, `commit` and `reflect` all
 * loop over the result. `id === null` is Python's `if a.workspace` being falsy
 * (the positional `workspace` argument omitted).
 */
export function resolveTargetWorkspaces(
  raws: readonly RawWorkspace[],
  home: AbsPath,
  id: string | null,
): Result<readonly Workspace[], string> {
  if (id === null) {
    return { ok: true, value: raws.map((raw) => expandWorkspace(raw, home)) };
  }
  const found = findWorkspace(raws, id);
  if (found === null) return { ok: false, error: noSuchWorkspaceMessage(id) };
  return { ok: true, value: [expandWorkspace(found, home)] };
}

/**
 * `_resolve_ws` (`bin/memory:155-162`): an explicit `--workspace` id wins
 * outright; otherwise fall back to resolving `cwd` by longest-prefix match
 * (`resolveWorkspace`) and fail if that comes up empty. `search` and `notes`
 * both need exactly one workspace, never a list.
 */
export function resolveWorkspaceForCwd(
  raws: readonly RawWorkspace[],
  home: AbsPath,
  cwd: AbsPath,
  explicitId: string | null,
): Result<Workspace, string> {
  if (explicitId !== null) {
    const found = findWorkspace(raws, explicitId);
    if (found === null) return { ok: false, error: noSuchWorkspaceMessage(explicitId) };
    return { ok: true, value: expandWorkspace(found, home) };
  }
  const resolved = resolveWorkspace(raws, cwd, home);
  if (resolved === null) return { ok: false, error: NO_WORKSPACE_FOR_CWD_MESSAGE };
  return { ok: true, value: resolved };
}

/**
 * Load the registry and map a `RegistryError` straight to a `CliOutcome`
 * failure — every command needs the raw workspace list first, so this is the
 * one place that decides how a broken (present but unparsable/malformed)
 * `registry.toml` is reported. Python has no equivalent: a broken registry
 * raises `tomllib.TOMLDecodeError` uncaught (an unhandled traceback exiting
 * 1) rather than a clean message — no parity case exercises that path, so
 * this is a deliberate improvement, not a byte-for-byte port.
 */
export async function loadRegistryForCli(
  fs: FileSystem,
  home: AbsPath,
): Promise<Result<readonly RawWorkspace[], CliOutcome>> {
  const registryPath = defaultRegistryPath(home);
  const result = await loadRegistry(fs, registryPath);
  if (result.ok) return result;
  return { ok: false, error: cliFailure(`registry error: ${result.error.message}`) };
}
