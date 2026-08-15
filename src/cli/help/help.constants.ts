import type { CommandDescriptor, EnvVarDescriptor } from "@/cli/help/help.typedefs.ts";
import {
  BLOCK_AFTER_DEFAULT,
  BLOCK_DRIFT_DEFAULT,
  ENV_BLOCK_AFTER,
  ENV_BLOCK_DRIFT,
  ENV_GATE_DISABLE,
  ENV_INJECT_LOG,
  ENV_INJECT_MIN_SCORE,
  ENV_LINK_BOOST,
  ENV_LOG_LEVEL,
  INJECT_MIN_SCORE_DEFAULT,
  LINK_BOOST_DEFAULT,
} from "@/core/config/config.constants.ts";
import { LogLevel } from "@/core/config/config.typedefs.ts";
import { DOCTOR_DESCRIPTOR } from "@/modules/installation/commands/doctor/doctor.constants.ts";
import {
  INSTALL_DESCRIPTOR,
  UNINSTALL_DESCRIPTOR,
} from "@/modules/installation/commands/install/install.constants.ts";
import { HOOK_DESCRIPTOR } from "@/modules/session/commands/hookDispatch/hookDispatch.constants.ts";
import { COMMIT_DESCRIPTOR } from "@/modules/worklog/commands/commit/commit.constants.ts";
import { RESOLVE_DESCRIPTOR } from "@/modules/workspace/commands/resolve/resolve.constants.ts";
import {
  WORKSPACE_ADD_DESCRIPTOR,
  WORKSPACE_LS_DESCRIPTOR,
  WORKSPACE_RM_DESCRIPTOR,
} from "@/modules/workspace/commands/workspace/workspace.constants.ts";
import { NOTES_DESCRIPTOR } from "@/retrieval/commands/notes/notes.constants.ts";
import { REINDEX_DESCRIPTOR } from "@/retrieval/commands/reindex/reindex.constants.ts";
import { SEARCH_DESCRIPTOR } from "@/retrieval/commands/search/search.constants.ts";

export const USAGE_HEADER = "memory — per-workspace memory for Claude Code";
export const USAGE_SECTION_HEADING = "Usage:";
export const ENV_SECTION_HEADING = "Environment:";
export const LINE_INDENT = "  ";
export const COMMAND_SUMMARY_SEPARATOR = "  — ";
export const ENV_NAME_COLUMN_PADDING = 2;

export const HELP_DESCRIPTOR: CommandDescriptor = {
  path: ["-h"],
  usage: ["-h", "--help"],
  summary: "show this help text",
  hidden: false,
};

export const VERSION_DESCRIPTOR: CommandDescriptor = {
  path: ["-V"],
  usage: ["-V", "--version"],
  summary: "show the installed version",
  hidden: false,
};

/** Every `CliCommand`'s descriptor, in the order `memory --help` lists them.
 * Adding a subcommand means adding its descriptor here. */
export const COMMAND_DESCRIPTORS: readonly CommandDescriptor[] = [
  WORKSPACE_ADD_DESCRIPTOR,
  WORKSPACE_RM_DESCRIPTOR,
  WORKSPACE_LS_DESCRIPTOR,
  RESOLVE_DESCRIPTOR,
  REINDEX_DESCRIPTOR,
  SEARCH_DESCRIPTOR,
  NOTES_DESCRIPTOR,
  COMMIT_DESCRIPTOR,
  DOCTOR_DESCRIPTOR,
  INSTALL_DESCRIPTOR,
  UNINSTALL_DESCRIPTOR,
  HOOK_DESCRIPTOR,
  HELP_DESCRIPTOR,
  VERSION_DESCRIPTOR,
];

export const ENV_VAR_DESCRIPTORS: readonly EnvVarDescriptor[] = [
  {
    name: ENV_INJECT_MIN_SCORE,
    description: `minimum BM25 strength to auto-inject a hit (default ${INJECT_MIN_SCORE_DEFAULT})`,
  },
  {
    name: ENV_LINK_BOOST,
    description: `RRF bonus per corroborating in-link (default ${LINK_BOOST_DEFAULT})`,
  },
  {
    name: ENV_INJECT_LOG,
    description: "set to 0 to disable per-prompt retrieval logging",
  },
  {
    name: ENV_BLOCK_AFTER,
    description: `nudges before the wrap-gate may block (default ${BLOCK_AFTER_DEFAULT})`,
  },
  {
    name: ENV_BLOCK_DRIFT,
    description: `dirty files before the wrap-gate may block (default ${BLOCK_DRIFT_DEFAULT})`,
  },
  {
    name: ENV_GATE_DISABLE,
    description: "set to 1 to disable wrap-gate blocking entirely",
  },
  {
    name: ENV_LOG_LEVEL,
    description: `debug | info | warn | error (default ${LogLevel.Warn})`,
  },
];
