import { appendToDated } from "../worklog/worklog.service.ts";
import { worktreeSlug } from "../workspace/resolver.service.ts";
import { renderCompactBlock } from "./compact.renderer.ts";
import { HookResultKind } from "./HookResult.ts";
import type { HookHandler } from "./hookRuntime.service.ts";
import type { CompactCheckpointPayload } from "./payload.ts";

/**
 * `PostCompact`: persist the compaction summary Claude Code hands back after
 * compacting into today's worklog journal, so distilled context survives the
 * reset. Write-only.
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
    // best-effort write only.
  }
  return { kind: HookResultKind.Silent };
};
