import type { CommandDescriptor } from "@/core/index.ts";

/** `~/.claude/memory/toggles/` — one marker file per silenced host session,
 * named `<session-id>.off`. Additive state next to the registry: not the index,
 * not the vault, never read across workspaces. */
export const TOGGLES_DIR_HOME_RELATIVE_PATH = "~/.claude/memory/toggles";

/** Markers older than this are swept on every toggle operation, bounding growth
 * from sessions that died before their SessionEnd cleanup could run. */
export const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const TOGGLE_DESCRIPTOR: CommandDescriptor = {
  path: ["toggle"],
  usage: ["toggle [on|off|status] [--session ID]"],
  summary:
    "mute/unmute cc-memory for one host session (default: $CLAUDE_CODE_SESSION_ID)",
  hidden: false,
};
