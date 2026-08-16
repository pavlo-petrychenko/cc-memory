import type { CommandDescriptor } from "@/core/index.ts";

export const NO_HITS_MESSAGE = "(no hits)";

export const SEARCH_DESCRIPTOR: CommandDescriptor = {
  path: ["search"],
  usage: ["search <query> [--workspace ID] [--cwd PATH] [-k N] [--worklog]"],
  summary: "search the knowledge base + worklogs",
  hidden: false,
};
