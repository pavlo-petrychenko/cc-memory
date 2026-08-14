// A literal `~/`-prefix (not a bare relative path) is required here: `expandPath`
// only expands a LEADING `~`, so this is what makes the result land under $HOME
// rather than under whatever the process's cwd happens to be.
export const LOG_FILE_HOME_RELATIVE_PATH = "~/.claude/memory/ccmem.log";
