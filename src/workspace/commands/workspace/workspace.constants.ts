import type { CommandDescriptor } from "@/core/index.ts";

export const NO_WORKSPACES_MESSAGE = "(no workspaces)";

export const WORKSPACE_ADD_DESCRIPTOR: CommandDescriptor = {
  path: ["workspace", "add"],
  usage: [
    "workspace add <id> --match <prefix>… [--kb PATH] [--worklogs PATH] [--exclude E…]",
  ],
  summary: "register a new workspace",
  hidden: false,
};

export const WORKSPACE_RM_DESCRIPTOR: CommandDescriptor = {
  path: ["workspace", "rm"],
  usage: ["workspace rm <id> [--purge]"],
  summary: "remove a workspace registration",
  hidden: false,
};

export const WORKSPACE_LS_DESCRIPTOR: CommandDescriptor = {
  path: ["workspace", "ls"],
  usage: ["workspace ls"],
  summary: "list registered workspaces",
  hidden: false,
};

export const DEFAULT_EXCLUDE = ["_Worklogs", "Archive", ".obsidian"];

export const GITIGNORE_CONTENT = ".obsidian/workspace*\n.obsidian/cache\n.DS_Store\n";

export const GIT_INIT_TIMEOUT_MS = 10_000;

export const HOME_NOTE_HEADER_PREFIX = "---\ntype: index\n---\n# ";
export const HOME_NOTE_HEADER_SUFFIX = " — Knowledge Base Index\n\n";
export const HOME_NOTE_BODY_PREFIX = "> Knowledge base for the **";
export const HOME_NOTE_BODY_SUFFIX = "** workspace.\n";
