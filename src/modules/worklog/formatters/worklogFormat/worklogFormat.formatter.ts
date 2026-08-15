import type {
  EntryTemplateInput,
  StateTemplateInput,
} from "@/modules/worklog/formatters/worklogFormat/worklogFormat.typedefs.ts";

/** The two worklog file formats — a contract with every worklog already written
 * into a vault, so they must stay exact, character for character. */
export class WorklogFormatter {
  stateTemplate(input: StateTemplateInput): string {
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

  entryTemplate(input: EntryTemplateInput): string {
    return `## ${input.time} — ${input.topic}
**Changes:** ${input.changes}
**Learned:** ${input.learned}
**Decided:** ${input.decided}
**Open:** ${input.open}
**Refs:** ${input.refs}
`;
  }
}
