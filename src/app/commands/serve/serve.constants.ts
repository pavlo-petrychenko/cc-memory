import type { CommandDescriptor } from "@/core/entry/entry.typedefs.ts";

export const SERVE_DESCRIPTOR: CommandDescriptor = {
  path: ["serve"],
  usage: ["serve [--port N] [--host HOST] [--open]"],
  summary: "start the local KB viewer (React + API)",
  hidden: false,
};
