import type { AbsPath } from "../core/AbsPath.ts";
import type { Config } from "../core/Config.ts";
import { expandPath } from "../core/paths.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { defaultRegistryPath, loadRegistry } from "../workspace/registry.service.ts";
import { resolveWorkspace } from "../workspace/resolver.service.ts";
import { serializeHookResult } from "./hookResult.serializer.ts";
import { type HookResult, HookResultKind } from "./HookResult.ts";
import type { JsonRecord } from "./payload.ts";
import { parseTolerantJson } from "./payload.ts";

/**
 * The shared preamble/postamble every hook needs: read stdin, resolve
 * exactly one workspace or go silent (the cwd-to-workspace isolation
 * boundary), run the event's handler, render the result through the hook
 * protocol, write stdout, and — no matter what happens above — exit 0 having
 * LOGGED any failure instead of swallowing it blind.
 *
 * `container`/`config` arrive as parameters rather than being built here, so
 * this whole pipeline is testable in-process with fakes —
 * `cli/commands/hook.command.ts`'s `hook()` is the one place that supplies a
 * REAL container for an actual invocation of `memory hook <name>`.
 */

export type HookContext = {
  readonly container: Container;
  readonly config: Config;
  readonly workspace: Workspace;
  /** The resolved `cwd` this invocation is scoped to — `payload.cwd` if
   * present and non-empty, else `container.env.cwd()` (`payload.get("cwd")
   * or os.getcwd()`, every hook's `main()`). Distinct from `workspace.kb`:
   * handlers that shell out to `git` (wrap-gate, worklog-floor) need the
   * ACTUAL working directory, not the vault. */
  readonly cwd: AbsPath;
};

export type HookHandler<TPayload> = (
  context: HookContext,
  payload: TPayload,
) => Promise<HookResult>;

/** Falls back to the process cwd when the payload's `cwd` field is either
 * absent or present-but-empty. */
function resolveHookCwd(rawCwd: string | null, container: Container): AbsPath {
  if (rawCwd === null || rawCwd === "") return container.env.cwd();
  return expandPath(rawCwd, container.env.home());
}

/**
 * Loads the registry and resolves it against `cwd`. A malformed (present
 * but unparsable) registry is treated as "no workspace" AND logged — this is
 * the hook-specific handling of a `RegistryError`, unlike the CLI, which
 * reports it to the caller.
 */
async function resolveWorkspaceForHook(
  container: Container,
  cwd: AbsPath,
): Promise<Workspace | null> {
  const home = container.env.home();
  const registryResult = await loadRegistry(container.fs, defaultRegistryPath(home));
  if (!registryResult.ok) {
    container.logger.error(
      `hook: registry load failed (${registryResult.error.kind}): ${registryResult.error.message}`,
    );
    return null;
  }
  return resolveWorkspace(registryResult.value, cwd, home);
}

/**
 * Run one hook event end to end. `parsePayload` and `handle` are supplied
 * separately (rather than pre-bound into a single closure) because the
 * shared preamble needs `payload.cwd` to resolve a workspace BEFORE it knows
 * whether `handle` should run at all — no workspace means `handle` is never
 * called, matching "no resolved workspace ⇒ silent for EVERY hook".
 *
 * Never throws and never leaves `container.stdio.exit` uncalled: every step
 * from the stdin read onward is inside the `try`, and the `finally` always
 * exits 0, regardless of which branch above it ran.
 */
export async function runHook<TPayload extends { readonly cwd: string | null }>(
  container: Container,
  config: Config,
  hookLabel: string,
  parsePayload: (record: JsonRecord) => TPayload,
  handle: HookHandler<TPayload>,
): Promise<void> {
  try {
    const rawStdin = await container.stdio.readStdin();
    const record = parseTolerantJson(rawStdin);
    const payload = parsePayload(record);
    const cwd = resolveHookCwd(payload.cwd, container);
    const workspace = await resolveWorkspaceForHook(container, cwd);

    const result: HookResult =
      workspace === null
        ? { kind: HookResultKind.Silent }
        : await handle({ container, config, workspace, cwd }, payload);

    const rendered = serializeHookResult(result);
    if (rendered !== null) container.stdio.write(rendered);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    container.logger.error(`hook '${hookLabel}' failed: ${message}`);
  } finally {
    container.stdio.exit(0);
  }
}
