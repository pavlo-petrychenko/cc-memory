import type { CliCommand } from "@/cli/args/args.typedefs.ts";

export type DoctorArgs = {
  readonly command: CliCommand.Doctor;
  readonly cwd: string | null;
  readonly prompt: string | null;
};
