import { Command } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { DOCTOR_DESCRIPTOR } from "@/modules/installation/commands/doctor/doctor.constants.ts";
import { DoctorUseCase } from "@/modules/installation/useCases/doctor.useCase.ts";

@Command({
  path: DOCTOR_DESCRIPTOR.path,
  usage: DOCTOR_DESCRIPTOR.usage,
  summary: DOCTOR_DESCRIPTOR.summary,
  hidden: DOCTOR_DESCRIPTOR.hidden,
  Handler: DoctorUseCase,
  mapOptions: (tokens): Result<DoctorOptions, ArgsError> => {
    const cwd = tokens.includes("--cwd")
      ? (tokens[tokens.indexOf("--cwd") + 1] ?? null)
      : null;
    const prompt = tokens.includes("--prompt")
      ? (tokens[tokens.indexOf("--prompt") + 1] ?? null)
      : null;
    return { ok: true, value: { cwd, prompt } };
  },
})
export class DoctorCommand {}

type DoctorOptions = Parameters<DoctorUseCase["execute"]>[0];
