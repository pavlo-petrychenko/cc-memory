import type { AbsPath } from "../core/AbsPath.ts";
import { parseConfig } from "../core/Config.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Container } from "../platform/container.ts";
import { buildIndex } from "../retrieval/build.service.ts";
import type { Candidate } from "../worklog/Candidate.ts";
import { proposalsDir } from "../worklog/worklog.service.ts";
import {
  isDue,
  isPreviousBriefProcessed,
  migrateLegacyCursor,
  readLastConsolidatedMs,
  stampLastConsolidated,
  stampLastRun,
} from "./cursor.service.ts";
import { decideWithLlm } from "./decide.service.ts";
import { gatherCandidates } from "./gather.service.ts";
import { renderBrief, renderProposals } from "./proposals.renderer.ts";
import type { RelatedNote } from "./Reflector.ts";
import { relatedNotes } from "./relate.service.ts";
import {
  hasSession,
  isSessionActive,
  killSession,
  spawnConsolidation,
  tmuxAvailable,
} from "./session.service.ts";

/**
 * Orchestration for one workspace's `memory reflect` invocation: due-check ->
 * reindex -> gather -> relate -> tmux-or-headless -> render -> stamp.
 * Returns the message line(s) to print, in emission order —
 * `reflect.command.ts` writes each with one `Stdio.write` call (the
 * successful tmux spawn is the one case whose single line embeds its own
 * `\n`).
 */

const CONSOLIDATION_SESSION_PREFIX = "cc-consolidate-";
const DEFAULT_SHELL = "/bin/zsh";
const RAW_LLM_UNAVAILABLE_SUFFIX = "(raw, LLM unavailable) ";

export type ReflectRunOptions = {
  readonly ifDue: boolean;
  readonly thresholdHours: number;
  readonly headless: boolean;
  readonly force: boolean;
};

function sessionNameFor(workspace: Workspace): string {
  return `${CONSOLIDATION_SESSION_PREFIX}${workspace.id}`;
}

/** Reads `CCMEM_CONSOLIDATE_CMD`, reusing `Config`'s own default rather than
 * re-deriving the literal string a second time. */
function readConsolidateCmd(container: Container): string {
  return parseConfig({
    CCMEM_CONSOLIDATE_CMD: container.env.get("CCMEM_CONSOLIDATE_CMD"),
  }).consolidateCmd;
}

/** Join a name onto an already-validated `AbsPath` directory. */
function joinUnderDir(dir: AbsPath, name: string): AbsPath {
  // SAFETY: `dir` is an already-absolute, normalized `AbsPath`; `name` is a
  // fixed literal filename built from the run's own `date`/`workspace.id` —
  // never raw external input — so the join stays absolute and normalized.
  return `${dir}/${name}` as AbsPath;
}

async function writeBriefFile(
  container: Container,
  workspace: Workspace,
  date: string,
  candidates: readonly Candidate[],
  related: readonly RelatedNote[],
): Promise<AbsPath> {
  const dir = proposalsDir(workspace);
  await container.fs.mkdir(dir);
  const path = joinUnderDir(dir, `_brief-${date}.md`);
  await container.fs.writeFile(
    path,
    renderBrief({ workspaceId: workspace.id, date, candidates, related }),
  );
  return path;
}

async function writeProposalsFile(
  container: Container,
  workspace: Workspace,
  date: string,
  candidates: readonly Candidate[],
  related: readonly RelatedNote[],
): Promise<{
  readonly path: AbsPath;
  readonly count: number;
  readonly llmError: string | null;
}> {
  const decideResult = await decideWithLlm(container.proc, candidates, related);
  const llmError = decideResult.ok ? null : decideResult.error;
  const rendered = renderProposals({
    workspaceId: workspace.id,
    date,
    candidates,
    error: llmError,
    decisions: decideResult.ok ? decideResult.value : [],
  });
  const dir = proposalsDir(workspace);
  await container.fs.mkdir(dir);
  const path = joinUnderDir(dir, `${date}.md`);
  await container.fs.writeFile(path, rendered.content);
  return { path, count: rendered.count, llmError };
}

/**
 * `tryInteractiveConsolidation`'s outcome — a closed set, so the caller's
 * "does this fall through to headless?" decision is a type-checked switch
 * rather than sniffing message text:
 *  - `skipped`: tmux isn't in play at all (`--headless`, or tmux missing) —
 *    the caller runs the headless branch as if this function didn't exist.
 *  - `done`: terminal for this run, one way or another — an already-active
 *    session left untouched, or a fresh spawn that succeeded.
 *  - `spawnFailed`: tmux was tried and failed, so the caller falls through
 *    into the headless branch.
 */
type InteractiveOutcome =
  | { readonly kind: "skipped" }
  | { readonly kind: "done"; readonly lines: readonly string[] }
  | { readonly kind: "spawnFailed"; readonly lines: readonly string[] };

/**
 * The tmux (interactive) branch: replace a stale/forced session, spawn a
 * fresh one, and report the outcome.
 */
async function tryInteractiveConsolidation(
  container: Container,
  workspace: Workspace,
  options: ReflectRunOptions,
  date: string,
  candidates: readonly Candidate[],
  related: readonly RelatedNote[],
  nowMs: number,
): Promise<InteractiveOutcome> {
  if (options.headless || !(await tmuxAvailable(container.proc))) {
    return { kind: "skipped" };
  }

  const sessionName = sessionNameFor(workspace);
  const lines: string[] = [];

  if (await hasSession(container.proc, sessionName)) {
    if (!options.force && (await isSessionActive(container.proc, sessionName))) {
      // Leave candidates pending; don't restamp — neither cursor advances
      // while a session is genuinely still being worked, so tomorrow's due
      // check (and this same gather window) sees it again.
      return {
        kind: "done",
        lines: [
          `${workspace.id}: consolidation already running -> tmux attach -t ${sessionName}` +
            "  (or rerun with --force)",
        ],
      };
    }
    await killSession(container.proc, sessionName);
    lines.push(
      `${workspace.id}: replaced ${options.force ? "existing" : "stale"} consolidation session`,
    );
  }

  const briefPath = await writeBriefFile(container, workspace, date, candidates, related);
  const shell = container.env.get("SHELL") ?? DEFAULT_SHELL;
  const spawnResult = await spawnConsolidation(
    container.proc,
    workspace,
    briefPath,
    sessionName,
    shell,
    readConsolidateCmd(container),
  );
  if (spawnResult.ok) {
    // Advance ONLY `lastRun` here: stamping `lastConsolidated` the moment
    // the tmux session merely SPAWNS would let an unattended night silently
    // drop every candidate in it — the brief is durable, but nothing durable
    // records that it was ever REVIEWED until `isPreviousBriefProcessed`
    // (or a later headless run) says so.
    await stampLastRun(container.fs, workspace, nowMs);
    lines.push(
      `${workspace.id}: ${candidates.length} candidates -> interactive consolidation ` +
        `in tmux '${sessionName}'. Attach: tmux attach -t ${sessionName}\n  brief: ${briefPath}`,
    );
    return { kind: "done", lines };
  }
  lines.push(
    `${workspace.id}: tmux spawn failed (${spawnResult.error}); falling back to headless`,
  );
  return { kind: "spawnFailed", lines };
}

async function runHeadless(
  container: Container,
  workspace: Workspace,
  date: string,
  candidates: readonly Candidate[],
  related: readonly RelatedNote[],
  nowMs: number,
): Promise<string> {
  const { path, count, llmError } = await writeProposalsFile(
    container,
    workspace,
    date,
    candidates,
    related,
  );
  // The headless path always produces a durable proposals file — even the
  // raw-candidate fallback is something a human can act on — so both
  // cursors advance together here.
  await stampLastRun(container.fs, workspace, nowMs);
  await stampLastConsolidated(container.fs, workspace, nowMs);
  const rawSuffix = llmError !== null ? RAW_LLM_UNAVAILABLE_SUFFIX : "";
  return `${workspace.id}: ${candidates.length} candidates -> ${count} proposal(s) ${rawSuffix}-> ${path}`;
}

export async function runReflect(
  container: Container,
  workspace: Workspace,
  options: ReflectRunOptions,
): Promise<readonly string[]> {
  await migrateLegacyCursor(container.fs, workspace);

  const nowMs = container.clock.nowMs();
  if (
    options.ifDue &&
    !(await isDue(container.fs, workspace, nowMs, options.thresholdHours))
  ) {
    return [`${workspace.id}: not due, skipping`];
  }

  // Best-effort; a broken vault must never abort the reflector (the same
  // fail-open shape as everything else here).
  try {
    await buildIndex(container, workspace, { incremental: true });
  } catch {
    // intentionally swallowed
  }

  // Second cursor-advance trigger: if the last brief we handed a human/agent
  // has since been fully marked `[x]`/`[~]`, treat everything up to now as
  // settled before computing this run's gather window.
  if (await isPreviousBriefProcessed(container.fs, workspace)) {
    await stampLastConsolidated(container.fs, workspace, nowMs);
  }

  const sinceMs = (await readLastConsolidatedMs(container.fs, workspace)) ?? 0;
  const candidates = await gatherCandidates(container.fs, workspace, sinceMs);
  const date = container.clock.today();

  if (candidates.length === 0) {
    await stampLastRun(container.fs, workspace, nowMs);
    return [`${workspace.id}: no candidates since last run`];
  }

  const related = await relatedNotes(container, workspace, candidates);

  const interactive = await tryInteractiveConsolidation(
    container,
    workspace,
    options,
    date,
    candidates,
    related,
    nowMs,
  );
  if (interactive.kind === "done") return interactive.lines;

  const headlessLine = await runHeadless(
    container,
    workspace,
    date,
    candidates,
    related,
    nowMs,
  );
  return interactive.kind === "spawnFailed"
    ? [...interactive.lines, headlessLine]
    : [headlessLine];
}
