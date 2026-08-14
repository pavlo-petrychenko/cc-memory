import type { HookArgs } from "../args.ts";
import { cliOutcome, type CliOutcome } from "../CliOutcome.ts";

/**
 * `memory hook <name>` — one of C3's two additive subcommands ([[contracts]]),
 * dispatching to the 5 handlers P7 will write (`src/hooks/*.ts`). They don't
 * exist yet, so this exists and parses but never pretends a handler ran.
 *
 * Stays SILENT on stdout and exits **0** rather than 1: this subcommand is
 * what `settings.json` will eventually invoke as a real Claude Code hook
 * (once P9's installer wires it up), and CLAUDE.md invariant #3 — "hooks fail
 * open, always exit 0" — applies to it even as a stub. The diagnostic goes to
 * stderr only, so nothing here could ever be mistaken for hook JSON output
 * on stdout (C2).
 */
export function hook(args: HookArgs): CliOutcome {
  return cliOutcome(0, `memory hook '${args.name}': not implemented yet (P7); no-op`);
}
