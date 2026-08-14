/**
 * The two worklog file formats. These strings are a contract with every worklog
 * already written into a vault, so they must stay exact, character for character.
 */

export type StateTemplateInput = {
  readonly workspace: string;
  readonly slug: string;
  readonly date: string;
};

/** The living per-worktree state file. */
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

/** One append-only journal entry. */
export function entryTemplate(input: EntryTemplateInput): string {
  return `## ${input.time} — ${input.topic}
**Changes:** ${input.changes}
**Learned:** ${input.learned}
**Decided:** ${input.decided}
**Open:** ${input.open}
**Refs:** ${input.refs}
`;
}
