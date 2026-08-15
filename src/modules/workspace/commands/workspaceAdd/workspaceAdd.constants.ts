import type { CommandDescriptor } from "@/core/index.ts";

export const WORKSPACE_ADD_DESCRIPTOR: CommandDescriptor = {
  path: ["workspace", "add"],
  usage: [
    "workspace add <id> --match <prefix>… [--kb PATH] [--worklogs PATH] [--exclude E…]",
  ],
  summary: "register a new workspace",
  hidden: false,
};
