import type { CommandDescriptor } from "@/cli/help/help.typedefs.ts";

export const REINDEX_DESCRIPTOR: CommandDescriptor = {
  name: "reindex",
  usage: ["reindex [workspace] [--full]"],
  summary: "rebuild the search index",
  hidden: false,
};
