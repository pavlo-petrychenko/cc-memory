import type { Stdio } from "../platform/stdio.port.ts";
import { CC_MEMORY_VERSION } from "../version.ts";
import { CLI_SUCCESS, type CliOutcome } from "./CliOutcome.ts";

/**
 * `-h`/`--help` (and a bare `memory` with no arguments), plus `--version`.
 *
 * This text is not parsed by any skill, so its exact wording is free to
 * change; what's required is that `memory --help` exits 0 and lists the real
 * command surface below.
 */
const USAGE = `memory — per-workspace memory for Claude Code

Usage:
  memory workspace add <id> --match <prefix>… [--kb PATH] [--worklogs PATH] [--exclude E…]
  memory workspace rm <id> [--purge]
  memory workspace ls
  memory resolve [cwd]                       which workspace + worktree a path maps to
  memory reindex [workspace] [--full]        rebuild the search index
  memory search <query> [--workspace ID] [--cwd PATH] [-k N] [--worklog]
  memory notes [--workspace ID] [--cwd PATH] [--folder F] [--json]
  memory commit [workspace] [-m MSG]         MANUAL git snapshot of a KB (local; no push)
  memory reflect [--workspace ID] [--all] [--if-due] [--threshold-hours N]
                 [--headless] [--force]
  memory doctor [--cwd PATH] [--prompt TEXT] self-test hooks and diagnose the install
  memory install [--dry-run] | uninstall     wire into (or out of) Claude Code

  memory --help | --version

Environment:
  CCMEM_INJECT_MIN_SCORE  minimum BM25 strength to auto-inject a hit (default 0.2)
  CCMEM_LINK_BOOST        RRF bonus per corroborating in-link (default 0.003)
  CCMEM_INJECT_LOG        set to 0 to disable per-prompt retrieval logging
  CCMEM_BLOCK_AFTER       nudges before the wrap-gate may block (default 2)
  CCMEM_BLOCK_DRIFT       dirty files before the wrap-gate may block (default 5)
  CCMEM_GATE_DISABLE      set to 1 to disable wrap-gate blocking entirely
  CCMEM_CONSOLIDATE_CMD   command the reflector runs in tmux
  CCMEM_LOG_LEVEL         debug | info | warn | error (default warn)
`;

export function help(stdio: Stdio): CliOutcome {
  stdio.write(USAGE);
  return CLI_SUCCESS;
}

export function version(stdio: Stdio): CliOutcome {
  stdio.write(`memory ${CC_MEMORY_VERSION}\n`);
  return CLI_SUCCESS;
}
