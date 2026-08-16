import type { CommandDescriptor } from "@/core/index.ts";

export const NOTES_DESCRIPTOR: CommandDescriptor = {
  path: ["notes"],
  usage: ["notes [--workspace ID] [--cwd PATH] [--folder F] [--json]"],
  summary: "enumerate indexed notes",
  hidden: false,
};
