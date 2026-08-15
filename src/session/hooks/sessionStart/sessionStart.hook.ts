import { KbMapFormatter, KbMapService, NoteParser } from "@/knowledge/index.ts";
import type { Container } from "@/platform/index.ts";
import { IndexBuildService } from "@/retrieval/index.ts";
import { CONTEXT_SEPARATOR } from "@/session/hooks/sessionStart/sessionStart.constants.ts";
import type { SessionStartPayload } from "@/session/payload/payload.typedefs.ts";
import type { HookHandler, HookInput } from "@/session/runtime/runtime.typedefs.ts";
import { HookEvent, HookResultKind } from "@/session/session.typedefs.ts";
import type { HookResult } from "@/session/session.typedefs.ts";
import { WorkingMemoryFormatter, WorklogStoreService } from "@/worklog/index.ts";
import { worktreeSlug } from "@/workspace/index.ts";

/**
 * `SessionStart`: run a fast incremental reindex, then inject the KB map +
 * this worktree's working memory, joined by a horizontal rule. Emits nothing
 * when both parts are empty — in practice `formatWorkingMemory` never
 * returns `""` (it always prints at least the `# Working memory — …`
 * heading), so this only fires when the KB map is also missing, but the
 * guard is kept regardless.
 *
 * `payload` carries only the resolved `workspace`/`cwd` (there is no other
 * `SessionStart` field), so it's barely used here.
 */
export class SessionStartHook implements HookHandler<SessionStartPayload> {
  constructor(
    private readonly container: Container,
    private readonly indexBuildService: IndexBuildService = new IndexBuildService(),
    private readonly kbMapService: KbMapService = new KbMapService(
      container.fs,
      new NoteParser(),
    ),
    private readonly kbMapFormatter: KbMapFormatter = new KbMapFormatter(),
    private readonly worklogStoreService: WorklogStoreService = new WorklogStoreService(
      container.fs,
      container.git,
    ),
    private readonly workingMemoryFormatter: WorkingMemoryFormatter = new WorkingMemoryFormatter(),
  ) {}

  async handle(payload: HookInput<SessionStartPayload>): Promise<HookResult> {
    const { workspace, cwd } = payload;

    try {
      await this.indexBuildService.build(this.container, workspace, {
        incremental: true,
      });
    } catch {
      // reindex failures are swallowed: a stale index beats a broken SessionStart.
    }

    const slug = await worktreeSlug(this.container.git, cwd, workspace);
    const kbMapInput = await this.kbMapService.build(
      workspace,
      this.container.env.home(),
    );
    const kbMapText = kbMapInput === null ? "" : this.kbMapFormatter.format(kbMapInput);

    const state = await this.worklogStoreService.readState(workspace, slug);
    const workingMemoryText = this.workingMemoryFormatter.format({
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
  }
}
