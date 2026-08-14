import { stripChars } from "../core/paths.ts";
import type { Candidate } from "./Candidate.ts";

/**
 * Worklog templates (C4) and reflector candidate-gathering (`lib/worklog.py:10-36`,
 * `bin/reflector.py:25-27,71-88`). Templates are agent-visible text — copied
 * verbatim, character for character.
 */

export type StateTemplateInput = {
  readonly workspace: string;
  readonly slug: string;
  readonly date: string;
};

/** `STATE_TEMPLATE` (`lib/worklog.py:10-27`) — the living per-worktree state file. */
export function stateTemplate(input: StateTemplateInput): string {
  return `---
type: worktree-state
workspace: ${input.workspace}
worktree: ${input.slug}
updated: ${input.date}
---
# ${input.slug} — working state

## Current focus
_(nothing yet)_

## Open threads
- [ ] _(none)_

## Working notes (ephemeral, not yet KB)
- _(none)_
`;
}

export type EntryTemplateInput = {
  readonly time: string;
  readonly topic: string;
  readonly changes: string;
  readonly learned: string;
  readonly decided: string;
  readonly open: string;
  readonly refs: string;
};

/** `ENTRY_TEMPLATE` (`lib/worklog.py:29-36`) — one append-only journal entry. */
export function entryTemplate(input: EntryTemplateInput): string {
  return `## ${input.time} — ${input.topic}
**Changes:** ${input.changes}
**Learned:** ${input.learned}
**Decided:** ${input.decided}
**Open:** ${input.open}
**Refs:** ${input.refs}
`;
}

// Not anchored (Python's `.search`, not `.match`) — a `#promote` tag can appear
// anywhere on the line.
const PROMOTE_TAG = /#promote\b/;
// A fresh `g`-flagged literal for `.replace()`/`.replaceAll()` only: Python's
// `re.sub` replaces every match by default, unlike JS `String.replace` with a
// non-global pattern (which stops after the first) — `bin/reflector.py:74`.
const PROMOTE_TAG_ALL = /#promote\b/g;
// Drops a leading `**Field:**` prefix a `#promote` line might carry
// (`bin/reflector.py:75`). Anchored, so a single non-global replace is enough.
const LEADING_FIELD_PREFIX = /^\s*[-*]*\s*\*\*[A-Za-z]+:\*\*\s*/;
// `**Learned:**`/`**Decided:**` lines (`bin/reflector.py:26`), case-insensitive.
const FIELD_LINE = /^\s*\*\*(Learned|Decided):\*\*\s*(.+)$/i;
const LEARNED_DECIDED_MIN_LENGTH = 12;

/**
 * One worklog file's promotion candidates (`bin/reflector.py:71-80`): every line
 * either tagged `#promote` (tag and any leading `**Field:**` prefix stripped, then
 * trimmed of `" -*"`), or a `**Learned:**`/`**Decided:**` line whose captured text
 * is longer than 12 characters. `src` labels every candidate with its origin
 * (`<slug>/<file>.md`) for the proposals file and consolidation brief.
 */
export function extractCandidates(text: string, src: string): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (PROMOTE_TAG.test(line)) {
      const withoutTag = line.replace(PROMOTE_TAG_ALL, "");
      const withoutFieldPrefix = withoutTag.replace(LEADING_FIELD_PREFIX, "");
      candidates.push({ text: stripChars(withoutFieldPrefix, " -*"), src });
      continue;
    }
    const fieldMatch = FIELD_LINE.exec(line);
    if (fieldMatch === null) continue;
    const captured = (fieldMatch[2] ?? "").trim();
    if (captured.length > LEARNED_DECIDED_MIN_LENGTH)
      candidates.push({ text: captured, src });
  }
  return candidates;
}

/**
 * De-duplicate candidates by text, case-insensitively, keeping the first
 * occurrence (`bin/reflector.py:82-88`).
 */
export function dedupeCandidates(candidates: readonly Candidate[]): readonly Candidate[] {
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}
