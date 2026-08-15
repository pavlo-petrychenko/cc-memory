import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { HookResult } from "@/session/session.typedefs.ts";

/**
 * The per-invocation resolution `HookRuntimeService` computes before ever
 * calling a handler: the workspace the payload's `cwd` resolved to, and that
 * resolved, absolute `cwd` itself (`payload.cwd` if present and non-empty,
 * else the process cwd). Distinct from `workspace.kb`: a handler that shells
 * out to `git` (wrap-gate, worklog-floor) needs the ACTUAL working
 * directory, not the vault.
 */
export type HookContext = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
};

/**
 * What a hook's `handle` method actually receives: the event's own payload
 * fields, plus the resolved `HookContext`. `Omit<TPayload, "cwd">` drops the
 * raw, possibly-absent `cwd` string the payload arrived with — it's already
 * been consumed by `HookRuntimeService` to resolve `HookContext.cwd`, and no
 * handler ever reads the raw form.
 */
export type HookInput<TPayload> = Omit<TPayload, "cwd"> & HookContext;

/**
 * One Claude Code hook handler. Constructor-injected with whatever ports
 * (and, for memory-inject/wrap-gate, `Config`) it needs; `HookRuntimeService`
 * calls `handle` exactly once a workspace has resolved for the payload's cwd
 * — no resolved workspace means `handle` is never called at all.
 */
export interface HookHandler<TPayload> {
  handle(payload: HookInput<TPayload>): Promise<HookResult>;
}
