import { UseCase } from "@/core/index.ts";
import type { AbsPath, Workspace } from "@/core/index.ts";
import { HookEvent, HookResultKind } from "@/core/transport/hook/hook.typedefs.ts";
import type { HookResult } from "@/core/transport/hook/hook.typedefs.ts";
import { KbMapFormatter, KbMapService } from "@/modules/kb/index.ts";
import { CONTEXT_SEPARATOR } from "@/modules/memory/hooks/sessionStart/sessionStart.constants.ts";
import { NoteService } from "@/modules/note/index.ts";
import {
  WorkingMemoryFormatter,
  WorklogService,
  WorklogStoreService,
} from "@/modules/worklog/index.ts";
import { worktreeSlug } from "@/modules/workspace/index.ts";

export type SessionStartInput = {
  readonly workspace: Workspace;
  readonly cwd: AbsPath;
};

/** `SessionStart`: run a fast incremental reindex, then inject the KB map + this
 * worktree's working memory, joined by a horizontal rule. */
export class SessionStartUseCase extends UseCase<SessionStartInput, HookResult> {
  private readonly noteService = this.makeService(NoteService);
  private readonly worklogService = this.makeService(WorklogService);
  private readonly kbMapService = this.makeService(KbMapService);
  private readonly kbMapFormatter = new KbMapFormatter();
  private readonly worklogStoreService = this.makeService(WorklogStoreService);
  private readonly workingMemoryFormatter = new WorkingMemoryFormatter();

  async execute(input: SessionStartInput): Promise<HookResult> {
    const { workspace, cwd } = input;

    try {
      await this.noteService.incrementalReindex(workspace);
      await this.worklogService.reindex(workspace);
    } catch {
      // reindex failures are swallowed: a stale index beats a broken SessionStart.
    }

    const slug = worktreeSlug(
      (await this.gateways.git.showToplevel(cwd)).trim(),
      cwd,
      workspace,
    );
    const kbMapInput = await this.kbMapService.build(workspace, this.gateways.env.home());
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
