import type { AbsPath } from "@/core/core.typedefs.ts";

/** As `registry.toml` stores it: `~`-relative paths, verbatim for portability.
 * Never read from directly for filesystem work — expand it first. */
export type RawWorkspace = {
  readonly id: string;
  readonly match: readonly string[];
  readonly kb: string;
  readonly worklogs: string;
  readonly exclude: readonly string[];
  readonly indexDb: string;
};

/** Every path expanded to an absolute, normalized form. Only constructible via
 * `expandWorkspace` — never assembled by hand, so "did I expand this?" is a
 * compile error. `matchedPrefix` is the longest-prefix root that matched the cwd. */
export type Workspace = {
  readonly id: string;
  readonly match: readonly AbsPath[];
  readonly kb: AbsPath;
  readonly worklogs: AbsPath;
  readonly exclude: readonly string[];
  readonly indexDb: AbsPath;
  readonly matchedPrefix: AbsPath;
};

/** The sanitized, filesystem-safe directory name under `<kb>/_Worklogs/`. Produced
 * by `sanitizeSlug`, always either `_root` or made of `[A-Za-z0-9._-]`. */
export type WorktreeSlug = string;
