import type { CommandDescriptor } from "@/cli/help/help.typedefs.ts";

export const RESOLVE_DESCRIPTOR: CommandDescriptor = {
  name: "resolve",
  usage: ["resolve [cwd]"],
  summary: "which workspace + worktree a path maps to",
  hidden: false,
};
