import { Command } from "@/core/index.ts";
import type { ArgsError, Result } from "@/core/index.ts";
import { flagValue, hasFlag } from "@/core/index.ts";
import {
  INSTALL_DESCRIPTOR,
  UNINSTALL_DESCRIPTOR,
} from "@/modules/installation/commands/install/install.constants.ts";
import { AgentTarget } from "@/modules/installation/install.typedefs.ts";
import { InstallUseCase } from "@/modules/installation/useCases/install.useCase.ts";
import { UninstallUseCase } from "@/modules/installation/useCases/uninstall.useCase.ts";

/** Parses `--agents claude,pi` into targets. Absent or empty means every
 * target; an unknown name is an argument error before anything is written. */
function parseAgentTargets(
  tokens: readonly string[],
): Result<readonly AgentTarget[], ArgsError> {
  const raw = flagValue(tokens, "--agents");
  if (raw === null) {
    return { ok: true, value: [AgentTarget.ClaudeCode, AgentTarget.Pi] };
  }
  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names.length === 0) {
    return { ok: true, value: [AgentTarget.ClaudeCode, AgentTarget.Pi] };
  }
  const targets: AgentTarget[] = [];
  for (const name of names) {
    const target = Object.values(AgentTarget).find((candidate) => candidate === name);
    if (target === undefined) {
      return {
        ok: false,
        error: {
          message: `unknown --agents target '${name}' (known targets: ${Object.values(AgentTarget).join(", ")})`,
        },
      };
    }
    if (!targets.includes(target)) targets.push(target);
  }
  return { ok: true, value: targets };
}

@Command({
  path: INSTALL_DESCRIPTOR.path,
  usage: INSTALL_DESCRIPTOR.usage,
  summary: INSTALL_DESCRIPTOR.summary,
  hidden: INSTALL_DESCRIPTOR.hidden,
  Handler: InstallUseCase,
  mapOptions: (tokens): Result<InstallOptions, ArgsError> => {
    const targets = parseAgentTargets(tokens);
    if (!targets.ok) return targets;
    return {
      ok: true,
      value: { dryRun: hasFlag(tokens, "--dry-run"), targets: targets.value },
    };
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
