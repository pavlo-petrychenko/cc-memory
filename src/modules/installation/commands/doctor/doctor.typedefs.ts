import type { CliCommand } from "@/core/index.ts";

export type DoctorArgs = {
  readonly command: CliCommand.Doctor;
  readonly cwd: string | null;
  readonly prompt: string | null;
};
