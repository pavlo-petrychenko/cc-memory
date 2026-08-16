import type { CommandDescriptor } from "@/core/index.ts";

export const WORKSPACE_RM_DESCRIPTOR: CommandDescriptor = {
  path: ["workspace", "rm"],
  usage: ["workspace rm <id> [--purge]"],
  summary: "remove a workspace registration",
  hidden: false,
};
