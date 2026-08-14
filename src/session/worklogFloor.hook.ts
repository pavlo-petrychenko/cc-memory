import { appendToDated } from "../worklog/worklog.service.ts";
import { renderFloorBlock } from "../worklog/worklogFloor.renderer.ts";
import { worktreeSlug } from "../workspace/resolver.service.ts";
import { HookResultKind } from "./HookResult.ts";
import type { HookHandler } from "./hookRuntime.service.ts";
import type { WorklogFloorPayload } from "./payload.ts";

const RECENT_COMMIT_COUNT = 5; // worklog-floor.py:44

/** The last line of a multi-line git output, trimmed — `tail[0].strip()`
 * (`worklog-floor.py:50-52`) after `.splitlines()[-1:]`. */
function lastLineTrimmed(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  return last === undefined ? "" : last.trim();
}

/**
 * `SessionEnd` (`hooks/worklog-floor.py:28-62`): a deterministic, zero-token
 * git/command skeleton appended to today's worklog journal, so even a killed
 * session leaves a record. Write-only — no stdout, ever.
 *
 * Every `Git` call here goes through `worklog-floor.py`'s own `_git` helper in
 * Python, which `.strip()`s its result (unlike `wrap-gate.py`'s `_git`, which
 * doesn't) — `git.port.ts`'s doc comment names this exact disagreement as the
 * reason trimming is left to the calling service rather than the port.
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

  // `(diffstat or staged or "").strip().splitlines()[-1:]` (`worklog-floor.py:50`).
  const combinedStat = diffStat !== "" ? diffStat : stagedStat;
  const uncommitted = combinedStat === "" ? "" : lastLineTrimmed(combinedStat);

  const block = renderFloorBlock({
    date,
    reason: payload.reason,
    branch,
    uncommitted,
    commits: recentCommits,
  });

  try {
    await appendToDated(container.fs, workspace, slug, date, block);
  } catch {
    // worklog-floor.py:59-62 — best-effort write only.
  }
  return { kind: HookResultKind.Silent };
};
