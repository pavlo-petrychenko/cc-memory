import { stripChars } from "../core/paths.ts";
import type { Candidate } from "../worklog/Candidate.ts";
import type { RelatedNote, ReflectorDecision } from "./Reflector.ts";
import { ReflectorAction } from "./Reflector.ts";

/**
 * Renders the reflector's consolidation prompt, proposals file and brief —
 * `bin/reflector.py:99-125,147-198`. Agent-visible text (C4/C2-adjacent): the
 * `PROMPT` template and both file formats are copied verbatim, including the
 * `%s` substitution order (candidates, then related notes).
 */

const IMPORTANCE_MIN = 4; // bin/reflector.py:27

/**
 * Python's `str.splitlines()` treats a trailing line break as ending the last
 * line rather than starting an empty one, and returns `[]` for `""` — unlike
 * `String.prototype.split` on a line-break regex, which would emit a spurious
 * trailing (or sole) empty string. Only matters where that phantom line would
 * be visible in the rendered output, as it is inside the proposals' body fence.
 */
function pythonSplitlines(text: string): readonly string[] {
  if (text === "") return [];
  const lines = text.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  if (last === "" && /[\r\n]$/.test(text)) lines.pop();
  return lines;
}

function formatCandidateLine(candidate: Candidate): string {
  return `- (${candidate.src}) ${candidate.text}`;
}

function formatRelatedNoteLine(note: RelatedNote): string {
  return `- ${note.title} [${note.path}]: ${note.snippet}`;
}

/** `decide_with_llm`'s prompt construction (`bin/reflector.py:99-125,128-131`). */
export function decisionPrompt(
  candidates: readonly Candidate[],
  related: readonly RelatedNote[],
): string {
  const candidateText = candidates.map(formatCandidateLine).join("\n");
  const relatedText =
    related.length > 0 ? related.map(formatRelatedNoteLine).join("\n") : "(none)";
  return `You are the consolidation reflector for a personal engineering knowledge base.
You decide whether short-term worklog notes should become durable KB knowledge.

KB rules: knowledge is feature/project-specific, NEVER task-specific; atomic
(one fact per note); reusable beyond the originating task. Contradictions
invalidate the old note (set superseded_by), never hard-delete.

For EACH candidate, choose exactly one action:
- ADD: a new durable, reusable fact not yet covered. Provide a folder, title, and body.
- UPDATE: extends/clarifies an existing note. Provide the existing note path and what to change.
- INVALIDATE: contradicts an existing note. Provide the existing note path + the corrected fact.
- NOOP: task-specific, trivial, or already covered. (Most casual notes are NOOP.)

Score importance 1-10 (durability x reusability). Be conservative; prefer NOOP
and fewer, higher-quality proposals. Merge duplicates across candidates.

Respond with ONLY a JSON array, each item:
{"action","title","folder","path","body","importance","rationale","source"}
(path = existing note for UPDATE/INVALIDATE; folder = target folder for ADD.)

## Candidates
${candidateText}

## Existing related KB notes
${relatedText}
`;
}

export type ProposalsInput = {
  readonly workspaceId: string;
  readonly date: string;
  readonly candidates: readonly Candidate[];
  /** `null` when the LLM decision step ran; a message when it didn't (`decide_with_llm`
   * returning an error) and raw candidates are listed for manual triage instead. */
  readonly error: string | null;
  readonly decisions: readonly ReflectorDecision[];
};

export type RenderedProposals = {
  readonly content: string;
  /** Kept-proposal count (or, in the error path, the raw candidate count) — what
   * the CLI reports back to the user (`bin/reflector.py:159,176`). */
  readonly count: number;
};

function isPromotable(decision: ReflectorDecision): boolean {
  return (
    (decision.action === ReflectorAction.Add ||
      decision.action === ReflectorAction.Update ||
      decision.action === ReflectorAction.Invalidate) &&
    (decision.importance ?? 0) >= IMPORTANCE_MIN
  );
}

function proposalTarget(decision: ReflectorDecision): string {
  if (decision.path !== undefined && decision.path !== "") return decision.path;
  const folder = decision.folder ?? "";
  const title = decision.title ?? "";
  return stripChars(`${folder}/${title}.md`, "/");
}

function renderKeptDecision(decision: ReflectorDecision): readonly string[] {
  const title = decision.title ?? "(untitled)";
  const importance =
    decision.importance === undefined ? "None" : String(decision.importance);
  return [
    `## [ ] ${decision.action}: ${title}  ·  importance ${importance}`,
    `- **Target:** \`${proposalTarget(decision)}\``,
    `- **Why:** ${decision.rationale ?? ""}`,
    `- **Source:** ${decision.source ?? ""}`,
    "- **Body:**",
    "  ```markdown",
    ...pythonSplitlines(decision.body ?? "").map((line) => `  ${line}`),
    "  ```",
    "",
  ];
}

/**
 * `write_proposals` (`bin/reflector.py:147-176`). When `error` is set, the LLM
 * decision step didn't run at all — every raw candidate is listed as an
 * unchecked triage item instead of a decision-driven proposal.
 */
export function renderProposals(input: ProposalsInput): RenderedProposals {
  const lines = [
    `# Consolidation proposals — ${input.workspaceId} — ${input.date}`,
    "",
    "Review with the `consolidate-review` skill. Approved items are written " +
      "to the KB via `save-learning` (your approval). Nothing here is in the KB yet.",
    "",
  ];

  if (input.error !== null) {
    lines.push(
      `> ⚠ LLM decision step unavailable (${input.error}). Raw candidates listed ` +
        "for manual triage.",
      "",
      "## Raw candidates",
    );
    for (const candidate of input.candidates)
      lines.push(`- [ ] (${candidate.src}) ${candidate.text}`);
    return { content: `${lines.join("\n")}\n`, count: input.candidates.length };
  }

  const kept = input.decisions.filter(isPromotable);
  const noopCount = input.decisions.filter(
    (decision) => decision.action === ReflectorAction.Noop,
  ).length;

  if (kept.length === 0) {
    lines.push("_No promotions proposed (all NOOP / below importance threshold)._");
  }
  for (const decision of kept) lines.push(...renderKeptDecision(decision));
  if (noopCount > 0) lines.push("", `<!-- ${noopCount} candidates judged NOOP -->`);

  return { content: `${lines.join("\n")}\n`, count: kept.length };
}

export type BriefInput = {
  readonly workspaceId: string;
  readonly date: string;
  readonly candidates: readonly Candidate[];
  readonly related: readonly RelatedNote[];
};

/** The consolidation brief the interactive tmux session reads (`write_brief`, `bin/reflector.py:184-198`). */
export function renderBrief(input: BriefInput): string {
  const lines = [
    `# Consolidation brief — ${input.workspaceId} — ${input.date}`,
    "",
    "Distilled from worklogs since the last run. For each candidate decide " +
      "ADD / UPDATE / INVALIDATE / NOOP against the existing KB; propose, then " +
      "apply approved ones via `save-learning` (ask before any KB write).",
    "",
    "## Candidates",
  ];
  for (const candidate of input.candidates) lines.push(formatCandidateLine(candidate));
  lines.push("", "## Existing related KB notes");
  if (input.related.length === 0) {
    lines.push("(none)");
  } else {
    for (const note of input.related) lines.push(formatRelatedNoteLine(note));
  }
  return `${lines.join("\n")}\n`;
}
