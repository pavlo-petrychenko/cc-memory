import type { CommandDescriptor } from "@/cli/help/help.typedefs.ts";

/** Never rendered in `memory --help` — `memory hook <name>` exists only for
 * `settings.json` to invoke as a registered hook command, never for a human
 * to type. */
export const HOOK_DESCRIPTOR: CommandDescriptor = {
  name: "hook",
  usage: ["hook <name>"],
  summary: "dispatch one of the 5 Claude Code hooks (internal)",
  hidden: true,
};
