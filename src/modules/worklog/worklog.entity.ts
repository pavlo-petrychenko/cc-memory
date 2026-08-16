import type { WorktreeSlug } from "@/core/domain.typedefs.ts";

/** `STATE.md` — the living per-worktree state. Identity is `(workspace, slug)`. */
export type WorktreeState = {
  readonly slug: WorktreeSlug;
  readonly body: string;
};

/** `<date>.md` — one append-only journal entry. Identity is
 * `(workspace, slug, date)`. */
export type JournalEntry = {
  readonly slug: WorktreeSlug;
  readonly date: string;
  readonly body: string;
};
