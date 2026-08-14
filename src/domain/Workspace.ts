import type { AbsPath } from "./AbsPath.ts";

/**
 * The workspace exactly as `registry.toml` stores it: `~`-relative paths, stored
 * verbatim for portability (`lib/registry.py` module docstring). Never read from
 * directly for filesystem work — expand it first.
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
 * Only constructible via the `expandWorkspace` service function (P4) — never
 * assembled by hand, so "did I expand this?" is a compile error rather than a
 * runtime bug (this was the PoC's biggest bug surface; see the migration plan's
 * "architecture" doc, decision #1).
 *
 * `matchedPrefix` is the `_prefix` key `resolve.resolve` smuggled onto the plain
 * workspace dict in the Python (`lib/resolve.py:25`) — here it is a real field.
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
 * directory name under `<kb>/_Worklogs/`. Produced by `paths.sanitizeSlug`, always
 * either `_root` or made of `[A-Za-z0-9._-]` (`lib/resolve.py:42-60`).
 */
export type WorktreeSlug = string;
