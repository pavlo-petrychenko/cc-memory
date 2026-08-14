import { formatCompactBlock } from "@/session/hooks/compactCheckpoint/compactCheckpoint.formatter.ts";
import type { CompactCheckpointPayload } from "@/session/payload/payload.typedefs.ts";
import type { HookHandler } from "@/session/runtime/runtime.service.ts";
import { HookResultKind } from "@/session/session.typedefs.ts";
import { appendToDated } from "@/worklog/index.ts";
import { worktreeSlug } from "@/workspace/index.ts";

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
  const block = formatCompactBlock({ trigger: payload.trigger, summary });

  try {
    await appendToDated(container.fs, workspace, slug, date, block);
  } catch {
    // best-effort write only.
  }
  return { kind: HookResultKind.Silent };
};
