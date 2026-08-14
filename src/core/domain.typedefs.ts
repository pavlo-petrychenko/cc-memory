import type { AbsPath } from "@/core/core.typedefs.ts";

/**
 * The workspace exactly as `registry.toml` stores it: `~`-relative paths, stored
 * verbatim for portability. Never read from directly for filesystem work — expand
 * it first.
 */
export type RawWorkspace = {
  readonly id: string;
  readonly match: readonly string[];
  readonly kb: string;
  readonly worklogs: string;
  readonly exclude: readonly string[];
  readonly indexDb: string;
};

/**
 * A workspace with every path expanded to an absolute, normalized form.
 * Only constructible via the `expandWorkspace` service function — never
 * assembled by hand, so "did I expand this?" is a compile error rather than a
 * runtime bug.
 *
 * `matchedPrefix` is the longest-prefix workspace root that matched the cwd
 * being resolved.
 */
export type Workspace = {
  readonly id: string;
  readonly match: readonly AbsPath[];
  readonly kb: AbsPath;
  readonly worklogs: AbsPath;
  readonly exclude: readonly string[];
  readonly indexDb: AbsPath;
  readonly matchedPrefix: AbsPath;
};

/**
 * A worktree's identity within a workspace — the sanitized, filesystem-safe
 * directory name under `<kb>/_Worklogs/`. Produced by `sanitizeSlug`, always
 * either `_root` or made of `[A-Za-z0-9._-]`.
 */
export type WorktreeSlug = string;
