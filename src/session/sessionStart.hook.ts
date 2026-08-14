import { formatKbMap } from "../knowledge/kbMap.formatter.ts";
import { buildKbMapInput } from "../knowledge/kbMap.service.ts";
import { buildIndex } from "../retrieval/build.service.ts";
import { formatWorkingMemory } from "../worklog/workingMemory.formatter.ts";
import { readState } from "../worklog/worklog.service.ts";
import { worktreeSlug } from "../workspace/resolver.service.ts";
import { HookEvent, HookResultKind } from "./HookResult.ts";
import type { HookHandler } from "./hookRuntime.service.ts";
import type { SessionStartPayload } from "./payload.ts";

const CONTEXT_SEPARATOR = "\n\n---\n\n";

/**
 * `SessionStart`: run a fast incremental reindex, then inject the KB map +
 * this worktree's working memory, joined by a horizontal rule. Emits nothing
 * when both parts are empty — in practice `formatWorkingMemory` never
 * returns `""` (it always prints at least the `# Working memory — …`
 * heading), so this only fires when the KB map is also missing, but the
 * guard is kept regardless.
 *
 * `payload` carries only `cwd` (already folded into `context.cwd` by
 * `runtime.ts`), so it's unused here.
 */
export const handleSessionStart: HookHandler<SessionStartPayload> = async (context) => {
  const { container, workspace, cwd } = context;

  try {
    await buildIndex(container, workspace, { incremental: true });
  } catch {
    // reindex failures are swallowed: a stale index beats a broken SessionStart.
  }

  const slug = await worktreeSlug(container.git, cwd, workspace);
  const kbMapInput = await buildKbMapInput(container.fs, workspace, container.env.home());
  const kbMapText = kbMapInput === null ? "" : formatKbMap(kbMapInput);

  const state = await readState(container.fs, workspace, slug);
  const workingMemoryText = formatWorkingMemory({
    workspaceId: workspace.id,
    slug,
    state,
  });

  const parts = [kbMapText, workingMemoryText].filter((part) => part !== "");
  if (parts.length === 0) return { kind: HookResultKind.Silent };

  return {
    kind: HookResultKind.Context,
    event: HookEvent.SessionStart,
    text: parts.join(CONTEXT_SEPARATOR),
  };
};
