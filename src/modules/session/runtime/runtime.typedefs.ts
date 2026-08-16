import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import type { HookResult } from "@/modules/session/session.typedefs.ts";

/** Distinct from `workspace.kb`: a handler that shells out to `git` needs the
 * ACTUAL working directory, not the vault. */
export type HookContext = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
};

/** `Omit<TPayload, "cwd">` drops the raw, possibly-absent `cwd` string — it's
 * already been consumed to resolve `HookContext.cwd`, and no handler reads the
 * raw form. */
export type HookInput<TPayload> = Omit<TPayload, "cwd"> & HookContext;

/** `HookRuntimeService` calls `handle` exactly once a workspace has resolved for
 * the payload's cwd — no resolved workspace means `handle` is never called. */
export interface HookHandler<TPayload> {
  handle(payload: HookInput<TPayload>): Promise<HookResult>;
}
