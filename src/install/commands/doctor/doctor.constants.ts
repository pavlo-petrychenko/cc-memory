import type { CommandDescriptor } from "@/cli/help/help.typedefs.ts";

export const DOCTOR_DESCRIPTOR: CommandDescriptor = {
  name: "doctor",
  usage: ["doctor [--cwd PATH] [--prompt TEXT]"],
  summary: "self-test hooks and diagnose the install",
  hidden: false,
};
