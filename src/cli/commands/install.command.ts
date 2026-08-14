import type { InstallArgs } from "../args.ts";
import { type CliOutcome, cliFailure } from "../CliOutcome.ts";

/**
 * `memory install`/`uninstall` — C3's other additive subcommand, replacing
 * `tools/install.py` (P9). Not landed yet: this exists and parses (including
 * `--dry-run`) but fails loudly rather than claiming to have touched
 * `settings.json` or `~/.local/bin/memory`.
 */
export function install(_args: InstallArgs): CliOutcome {
  return cliFailure("memory install is not implemented yet (P9)");
}

export function uninstall(): CliOutcome {
  return cliFailure("memory uninstall is not implemented yet (P9)");
}
