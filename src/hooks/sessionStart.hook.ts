import { HookEvent, HookResultKind } from "../domain/HookResult.ts";
import { renderKbMap } from "../domain/render/kbMap.renderer.ts";
import { renderWorkingMemory } from "../domain/render/workingMemory.renderer.ts";
import { buildIndex } from "../services/index/build.ts";
import { buildKbMapInput } from "../services/kbMap.service.ts";
import { worktreeSlug } from "../services/resolver.service.ts";
import { readState } from "../services/worklog.service.ts";
import type { SessionStartPayload } from "./payload.ts";
import type { HookHandler } from "./runtime.ts";

// `"\n\n---\n\n".join(p for p in parts if p)` (`session-start.py:126-127`).
const CONTEXT_SEPARATOR = "\n\n---\n\n";

/**
 * `SessionStart` (`hooks/session-start.py:111-131`): run a fast incremental
 * reindex, then inject the KB map + this worktree's working memory, joined by
 * a horizontal rule. Emits nothing when both parts are empty — in practice
 * `renderWorkingMemory` never returns `""` (it always prints at least the
 * `# Working memory — …` heading), so this only fires when the KB map is also
 * missing, but the guard is kept to match `session-start.py:128-129` exactly.
 *
 * `payload` carries only `cwd` (already folded into `context.cwd` by
 * `runtime.ts`), so it's unused here — same as Python's `main()`, which never
 * reads `session_id`/`source` off this event's payload either.
 */
export const handleSessionStart: HookHandler<SessionStartPayload> = async (context) => {
  const { container, workspace, cwd } = context;

  try {
    await buildIndex(container, workspace, { incremental: true });
  } catch {
    // session-start.py:121-124 — reindex failures are swallowed: a stale
    // index beats a broken SessionStart.
  }

  const slug = await worktreeSlug(container.git, cwd, workspace);
  const kbMapInput = await buildKbMapInput(container.fs, workspace, container.env.home());
  const kbMapText = kbMapInput === null ? "" : renderKbMap(kbMapInput);

  const state = await readState(container.fs, workspace, slug);
  const workingMemoryText = renderWorkingMemory({
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
