import type { AbsPath } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import type { RawWorkspace, Workspace } from "@/core/index.ts";
import { cliFailure } from "@/core/outcome/index.ts";
import type { CliOutcome } from "@/core/outcome/outcome.typedefs.ts";
import type { FileSystem } from "@/platform/index.ts";
import {
  defaultRegistryPath,
  expandWorkspace,
  findWorkspace,
  loadRegistry,
} from "@/workspace/index.ts";
import { resolveWorkspace } from "@/workspace/index.ts";
import { NO_WORKSPACE_FOR_CWD_MESSAGE } from "@/workspace/targetResolution/targetResolution.constants.ts";

/**
 * Two resolvers shared across commands, both returning a `Result` a command
 * can match on and turn into a `CliOutcome` via `cliFailure`, rather than
 * terminating the process from inside the resolver itself.
 */

/** The exact "no such workspace" text, shared by both resolvers below. */
export function noSuchWorkspaceMessage(id: string): string {
  return `no such workspace: ${id}`;
}

/**
 * A single workspace by id, or every registered workspace, all expanded —
 * `reindex` and `commit` both loop over the result. `id === null`
 * means the positional `workspace` argument was omitted.
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
 * An explicit `--workspace` id wins outright; otherwise fall back to
 * resolving `cwd` by longest-prefix match (`resolveWorkspace`) and fail if
 * that comes up empty. `search` and `notes` both need exactly one workspace,
 * never a list.
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
 * `registry.toml` is reported, as a clean message rather than an unhandled
 * exception.
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
