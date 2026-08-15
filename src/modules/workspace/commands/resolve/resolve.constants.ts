import type { CommandDescriptor } from "@/core/index.ts";

export const RESOLVE_DESCRIPTOR: CommandDescriptor = {
  path: ["resolve"],
  usage: ["resolve [cwd]"],
  summary: "which workspace + worktree a path maps to",
  hidden: false,
};
