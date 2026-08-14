import type { Container } from "../../container.ts";
import { expandPath } from "../../domain/paths.ts";
import { defaultRegistryPath } from "../../services/registry.service.ts";
import { resolveWorkspace } from "../../services/resolver.service.ts";
import type { DoctorArgs } from "../args.ts";
import { CLI_SUCCESS, type CliOutcome } from "../CliOutcome.ts";
import {
  formatCwdResolution,
  formatHookNotImplemented,
  formatRegistryStatus,
} from "../format.ts";
import { loadRegistryForCli } from "../resolveTarget.ts";

/** The 5 hooks, in `bin/memory:222-226,237`'s order (`session-start`,
 * `memory-inject`, `wrap-gate` — the 3 given a valid read-only payload — then
 * `worklog-floor`, `compact-checkpoint`, the 2 write hooks). Named without the
 * `.py` suffix, matching the `memory hook <name>` dispatch this project adds
 * (see [[entrypoints]]), since P7 hasn't landed a TypeScript equivalent yet. */
const DOCTOR_HOOK_NAMES = [
  "session-start",
  "memory-inject",
  "wrap-gate",
  "worklog-floor",
  "compact-checkpoint",
];

/**
 * `cmd_doctor` (`bin/memory:212-250`), BASIC version (P9 owns the full one).
 * Reproduces the two lines that don't depend on the 5 hooks existing yet
 * (registry status, cwd resolution) byte-for-byte; the per-hook report is
 * honestly "(not implemented yet)" rather than fabricating an exit code or
 * output a hook this packet never wrote could have produced — Python's real
 * doctor spawns each hook script and reports its actual exit/output, which is
 * P7's (and P9's "expands it") job, not this stub's.
 */
export async function doctor(
  container: Container,
  args: DoctorArgs,
): Promise<CliOutcome> {
  const home = container.env.home();
  const registryPath = defaultRegistryPath(home);
  const registryResult = await loadRegistryForCli(container.fs, home);
  const registryStatus =
    registryResult.ok && registryResult.value.length > 0 ? "(ok)" : "(empty)";
  container.stdio.write(formatRegistryStatus(registryPath, registryStatus));

  const cwd = args.cwd !== null ? expandPath(args.cwd, home) : container.env.cwd();
  const raws = registryResult.ok ? registryResult.value : [];
  const workspace = resolveWorkspace(raws, cwd, home);
  container.stdio.write(
    formatCwdResolution(cwd, workspace !== null ? workspace.id : "no workspace"),
  );

  for (const hookName of DOCTOR_HOOK_NAMES) {
    container.stdio.write(formatHookNotImplemented(hookName));
  }
  return CLI_SUCCESS;
}
