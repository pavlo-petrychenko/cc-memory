import { appendToDated } from "../worklog/worklog.service.ts";
import { worktreeSlug } from "../workspace/resolver.service.ts";
import { renderCompactBlock } from "./compact.renderer.ts";
import { HookResultKind } from "./HookResult.ts";
import type { HookHandler } from "./hookRuntime.service.ts";
import type { CompactCheckpointPayload } from "./payload.ts";

/**
 * `PostCompact` (`hooks/compact-checkpoint.py:18-39`): persist the
 * compaction summary Claude Code hands back after compacting into today's
 * worklog journal, so distilled context survives the reset. Write-only.
 *
 * Python checks `summary` for emptiness BEFORE resolving a workspace
 * (`compact-checkpoint.py:24-29`); here the workspace is already resolved by
 * `runtime.ts` before any handler runs, so the same "empty summary ⇒ no
 * write" gate is applied here instead. `resolveWorkspace` is a pure lookup
 * with no side effects, so swapping which gate runs first changes nothing
 * observable.
 */
export const handleCompactCheckpoint: HookHandler<CompactCheckpointPayload> = async (
  context,
  payload,
) => {
  const summary = payload.compactSummary.trim();
  if (summary === "") return { kind: HookResultKind.Silent };

  const { container, workspace, cwd } = context;
  const slug = await worktreeSlug(container.git, cwd, workspace);
  const date = container.clock.today();
  const block = renderCompactBlock({ trigger: payload.trigger, summary });

  try {
    await appendToDated(container.fs, workspace, slug, date, block);
  } catch {
    // compact-checkpoint.py:36-39 — best-effort write only.
  }
  return { kind: HookResultKind.Silent };
};
