import type { AbsPath } from "../core/AbsPath.ts";
import type { Config } from "../core/Config.ts";
import { expandPath } from "../core/paths.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { defaultRegistryPath, loadRegistry } from "../workspace/registry.service.ts";
import { resolveWorkspace } from "../workspace/resolver.service.ts";
import { renderHookResult } from "./hookResult.renderer.ts";
import { type HookResult, HookResultKind } from "./HookResult.ts";
import type { JsonRecord } from "./payload.ts";
import { parseTolerantJson } from "./payload.ts";

/**
 * The shared preamble/postamble copy-pasted into all five Python hooks (e.g.
 * `hooks/session-start.py:111-139`): read stdin, resolve exactly one
 * workspace or go silent (invariant #2 — the isolation boundary), run the
 * event's handler, render the result through C2, write stdout, and — no
 * matter what happens above — exit 0 having LOGGED any failure instead of
 * swallowing it blind ([[bugfixes]] #9's `runHook`/CLI wiring).
 *
 * `container`/`config` arrive as parameters rather than being built here, so
 * this whole pipeline is testable in-process with fakes
 * (`tests/contract/hooks/**`) — `cli/commands/hook.command.ts`'s `hook()` is
 * the one place that supplies a REAL container for an actual invocation of
 * `memory hook <name>`.
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

/** `payload.get("cwd") or os.getcwd()`, then `registry.expand(cwd)`
 * (`resolve.py:16`) — a present-but-empty `cwd` field is also falsy in
 * Python, so it falls back the same as a missing one. */
function resolveHookCwd(rawCwd: string | null, container: Container): AbsPath {
  if (rawCwd === null || rawCwd === "") return container.env.cwd();
  return expandPath(rawCwd, container.env.home());
}

/**
 * `resolve.resolve(cwd)` (`resolve.py:12-26`) plus the registry-load half of
 * `registry.load` (`registry.py:33-39`), composed the way every hook's
 * `main()` uses them together. A malformed (present but unparsable) registry
 * is treated as "no workspace" AND logged — `services/registry.service.ts`'s
 * own doc comment names this as the hook-specific handling of a
 * `RegistryError`, unlike the CLI (P6), which reports it to the caller.
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

    const rendered = renderHookResult(result);
    if (rendered !== null) container.stdio.write(rendered);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    container.logger.error(`hook '${hookLabel}' failed: ${message}`);
  } finally {
    container.stdio.exit(0);
  }
}
