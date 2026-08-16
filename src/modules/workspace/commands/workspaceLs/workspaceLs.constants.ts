import type { CommandDescriptor } from "@/core/index.ts";

export const WORKSPACE_LS_DESCRIPTOR: CommandDescriptor = {
  path: ["workspace", "ls"],
  usage: ["workspace ls"],
  summary: "list registered workspaces",
  hidden: false,
};
