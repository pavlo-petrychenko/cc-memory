export const NO_WORKSPACES_MESSAGE = "(no workspaces)";

export const DEFAULT_EXCLUDE = ["_Worklogs", "Archive", ".obsidian"];

/** Written only when `<kb>/.gitignore` doesn't exist yet. */
export const GITIGNORE_CONTENT = ".obsidian/workspace*\n.obsidian/cache\n.DS_Store\n";

export const GIT_INIT_TIMEOUT_MS = 10_000; // matches git.adapter.ts's WRITE_TIMEOUT_MS

// The home note's frontmatter and heading — written once at workspace creation.
export const HOME_NOTE_HEADER_PREFIX = "---\ntype: index\n---\n# ";
export const HOME_NOTE_HEADER_SUFFIX = " — Knowledge Base Index\n\n";
export const HOME_NOTE_BODY_PREFIX = "> Knowledge base for the **";
export const HOME_NOTE_BODY_SUFFIX = "** workspace.\n";
