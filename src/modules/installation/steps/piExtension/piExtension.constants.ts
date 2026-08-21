/** `~/.pi/agent/extensions/` — pi's global auto-discovery directory. */
export const PI_EXTENSIONS_HOME_RELATIVE_PATH = "~/.pi/agent/extensions";

/** The bundled bridge, copied here as plain JavaScript so pi's TypeScript
 * loader never has to resolve the repo. */
export const PI_EXTENSION_FILENAME = "cc-memory.js";

/** `~/.pi/agent/skills/` — the pi mirror of the skill symlinks Claude Code
 * gets under `~/.claude/skills`. */
export const PI_SKILLS_HOME_RELATIVE_PATH = "~/.pi/agent/skills";
