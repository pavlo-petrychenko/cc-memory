import type { CommandDescriptor } from "@/core/index.ts";

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
