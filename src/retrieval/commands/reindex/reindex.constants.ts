import type { CommandDescriptor } from "@/core/index.ts";

export const REINDEX_DESCRIPTOR: CommandDescriptor = {
  path: ["reindex"],
  usage: ["reindex [workspace] [--full]"],
  summary: "rebuild the search index",
  hidden: false,
};
