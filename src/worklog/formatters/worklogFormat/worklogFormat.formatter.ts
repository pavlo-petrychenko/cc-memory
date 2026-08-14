import {
  ENTRY_TEMPLATE,
  STATE_TEMPLATE,
} from "@/worklog/formatters/worklogFormat/worklogFormat.constants.ts";
import type {
  EntryTemplateInput,
  StateTemplateInput,
} from "@/worklog/formatters/worklogFormat/worklogFormat.typedefs.ts";

/** The living per-worktree state file. */
export function stateTemplate(input: StateTemplateInput): string {
  return STATE_TEMPLATE(input);
}

/** One append-only journal entry. */
export function entryTemplate(input: EntryTemplateInput): string {
  return ENTRY_TEMPLATE(input);
}
