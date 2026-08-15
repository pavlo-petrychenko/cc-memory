export const REGISTRY_HEADER =
  "# cc-memory workspace registry (managed by `memory workspace …`).\n" +
  "# Paths may use ~; they are expanded at load time. One block per workspace.\n\n";

export const PATH_SEPARATOR = "/";

export const NO_WORKSPACE_FOR_CWD_MESSAGE = "no workspace for cwd; pass --workspace";

export const NO_WORKSPACES_MESSAGE = "(no workspaces)";

export const DEFAULT_EXCLUDE = ["_Worklogs", "Archive", ".obsidian"];

export const GITIGNORE_CONTENT = ".obsidian/workspace*\n.obsidian/cache\n.DS_Store\n";

export const GIT_INIT_TIMEOUT_MS = 10_000;

export const HOME_NOTE_HEADER_PREFIX = "---\ntype: index\n---\n# ";
export const HOME_NOTE_HEADER_SUFFIX = " — Knowledge Base Index\n\n";
export const HOME_NOTE_BODY_PREFIX = "> Knowledge base for the **";
export const HOME_NOTE_BODY_SUFFIX = "** workspace.\n";
