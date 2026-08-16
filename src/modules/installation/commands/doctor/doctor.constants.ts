import type { CommandDescriptor } from "@/core/index.ts";

export const DOCTOR_DESCRIPTOR: CommandDescriptor = {
  path: ["doctor"],
  usage: ["doctor [--cwd PATH] [--prompt TEXT]"],
  summary: "self-test hooks and diagnose the install",
  hidden: false,
};
