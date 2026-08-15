import type { CommandDescriptor } from "@/cli/help/help.typedefs.ts";

export const NOTES_DESCRIPTOR: CommandDescriptor = {
  name: "notes",
  usage: ["notes [--workspace ID] [--cwd PATH] [--folder F] [--json]"],
  summary: "enumerate indexed notes",
  hidden: false,
};
