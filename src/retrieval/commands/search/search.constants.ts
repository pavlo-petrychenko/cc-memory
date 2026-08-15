import type { CommandDescriptor } from "@/cli/help/help.typedefs.ts";

export const NO_HITS_MESSAGE = "(no hits)";

export const SEARCH_DESCRIPTOR: CommandDescriptor = {
  name: "search",
  usage: ["search <query> [--workspace ID] [--cwd PATH] [-k N] [--worklog]"],
  summary: "search the knowledge base + worklogs",
  hidden: false,
};
