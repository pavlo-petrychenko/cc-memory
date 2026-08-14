import { appendToDated } from "../worklog/worklog.service.ts";
import { formatFloorBlock } from "../worklog/worklogFloor.formatter.ts";
import { worktreeSlug } from "../workspace/resolver.service.ts";
import { HookResultKind } from "./HookResult.ts";
import type { HookHandler } from "./hookRuntime.service.ts";
import type { WorklogFloorPayload } from "./payload.ts";

const RECENT_COMMIT_COUNT = 5;

/** The last line of a multi-line git output, trimmed. */
function lastLineTrimmed(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  return last === undefined ? "" : last.trim();
}

/**
 * `SessionEnd`: a deterministic, zero-token git/command skeleton appended to
 * today's worklog journal, so even a killed session leaves a record.
 * Write-only — no stdout, ever.
 *
 * Every `Git` call here has its result trimmed by this handler rather than by
 * the `Git` port itself, since other callers of the same port need the
 * untrimmed output — see `git.typedefs.ts`.
 */
export const handleWorklogFloor: HookHandler<WorklogFloorPayload> = async (
  context,
  payload,
) => {
  const { container, workspace, cwd } = context;
  const slug = await worktreeSlug(container.git, cwd, workspace);
  const date = container.clock.today();

  const branch = (await container.git.revParse(cwd, ["--abbrev-ref", "HEAD"])).trim();
  const diffStat = (await container.git.diffStat(cwd, false)).trim();
  const stagedStat = (await container.git.diffStat(cwd, true)).trim();
  const recentCommits = (await container.git.logOneline(cwd, RECENT_COMMIT_COUNT)).trim();

  const combinedStat = diffStat !== "" ? diffStat : stagedStat;
  const uncommitted = combinedStat === "" ? "" : lastLineTrimmed(combinedStat);

  const block = formatFloorBlock({
    date,
    reason: payload.reason,
    branch,
    uncommitted,
    commits: recentCommits,
  });

  try {
    await appendToDated(container.fs, workspace, slug, date, block);
  } catch {
    // best-effort write only.
  }
  return { kind: HookResultKind.Silent };
};
