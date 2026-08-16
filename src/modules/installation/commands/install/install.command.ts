import { Command } from "@/core/index.ts";
import { hasFlag } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import {
  INSTALL_DESCRIPTOR,
  UNINSTALL_DESCRIPTOR,
} from "@/modules/installation/commands/install/install.constants.ts";
import { InstallUseCase } from "@/modules/installation/useCases/install.useCase.ts";
import { UninstallUseCase } from "@/modules/installation/useCases/uninstall.useCase.ts";

@Command({
  path: INSTALL_DESCRIPTOR.path,
  usage: INSTALL_DESCRIPTOR.usage,
  summary: INSTALL_DESCRIPTOR.summary,
  hidden: INSTALL_DESCRIPTOR.hidden,
  Handler: InstallUseCase,
  mapOptions: (tokens): Result<InstallOptions, ArgsError> => {
    return { ok: true, value: { dryRun: hasFlag(tokens, "--dry-run") } };
  },
})
export class InstallCommand {}

@Command({
  path: UNINSTALL_DESCRIPTOR.path,
  usage: UNINSTALL_DESCRIPTOR.usage,
  summary: UNINSTALL_DESCRIPTOR.summary,
  hidden: UNINSTALL_DESCRIPTOR.hidden,
  Handler: UninstallUseCase,
  mapOptions: (_tokens): Result<Record<string, never>, ArgsError> => {
    return { ok: true, value: {} };
  },
})
export class UninstallCommand {}

type InstallOptions = Parameters<InstallUseCase["execute"]>[0];
