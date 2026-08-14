import type { AbsPath } from "../core/AbsPath.ts";
import type { Workspace } from "../core/Workspace.ts";
import type { Proc } from "../platform/proc.port.ts";

/**
 * tmux lifecycle for the interactive consolidation session. Every function
 * spawns `tmux` through `Proc` — never `child_process` directly.
 */

// The bare-shell names a leftover, already-exited consolidation session's
// pane can be running — anything else means the consolidation command
// (`claude`, or whatever `CCMEM_CONSOLIDATE_CMD` names) is still active.
const BARE_SHELL_COMMANDS: ReadonlySet<string> = new Set([
  "zsh",
  "-zsh",
  "bash",
  "-bash",
  "sh",
  "-sh",
  "fish",
  "-fish",
  "dash",
]);

/**
 * Whether `tmux` is available: this project's only process seam is `Proc`,
 * so the probe is "does `tmux -V` even start" — a spawn failure (ENOENT) is
 * the one thing that can make `Proc.run` reject here, since no `timeoutMs`
 * is set. The exit code is not consulted; only "present on PATH" matters,
 * not "runs successfully".
 */
export async function tmuxAvailable(proc: Proc): Promise<boolean> {
  try {
    await proc.run("tmux", ["-V"], {});
    return true;
  } catch {
    return false;
  }
}

/** Whether a tmux session with this name currently exists. */
export async function hasSession(proc: Proc, sessionName: string): Promise<boolean> {
  const result = await proc.run("tmux", ["has-session", "-t", sessionName], {});
  return result.exitCode === 0;
}

/**
 * An EMPTY pane command (tmux couldn't report one) counts as active —
 * "unknown -> assume active, don't disturb" is the conservative default.
 */
export async function isSessionActive(proc: Proc, sessionName: string): Promise<boolean> {
  const result = await proc.run(
    "tmux",
    ["display-message", "-p", "-t", sessionName, "#{pane_current_command}"],
    {},
  );
  const command = result.stdout.trim().toLowerCase();
  if (command === "") return true;
  return !BARE_SHELL_COMMANDS.has(command);
}

/** Kills a tmux session by name; the result is not inspected. */
export async function killSession(proc: Proc, sessionName: string): Promise<void> {
  await proc.run("tmux", ["kill-session", "-t", sessionName], {});
}

/**
 * The exact text sent to `claude` inside the spawned session — agent-visible,
 * so its wording is a contract. Not one of the renderers in
 * `reflect/proposals.renderer.ts` (that file covers the LLM decision prompt
 * and the two persisted vault files only); this one is a live shell
 * argument, never written to disk, so it lives here with the rest of the
 * tmux plumbing that is its only caller.
 */
function consolidationPrompt(workspaceId: string, briefPath: AbsPath): string {
  return (
    `cc-memory consolidation for the ${workspaceId} workspace. Read the brief at ` +
    `${briefPath} . For each candidate decide ADD, UPDATE, INVALIDATE or NOOP against ` +
    `the existing KB (use memory-search to check). Propose the changes, then apply ` +
    `only the ones I approve via the save-learning skill. Do NOT write to the KB ` +
    `without my explicit approval. When finished, run memory reindex.`
  );
}

/** The inner `sh -c` command line the tmux session runs. */
function consolidationInnerCommand(
  consolidateCmd: string,
  prompt: string,
  shell: string,
): string {
  return (
    `${consolidateCmd} '${prompt}'; echo; ` +
    `echo '[cc-memory consolidation finished -- Ctrl-b d to detach]'; exec ${shell}`
  );
}

export type SpawnConsolidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/**
 * Launches a DETACHED tmux session running the interactive consolidation
 * prompt against `claude` (or `CCMEM_CONSOLIDATE_CMD`), landed in the
 * workspace's first `match` directory so `memory-search`/`save-learning`
 * resolve there automatically. `shell` and `consolidateCmd` arrive already
 * resolved (env-reading is the caller's job — `run.service.ts` — keeping
 * this function's only port dependency `Proc`).
 */
export async function spawnConsolidation(
  proc: Proc,
  workspace: Workspace,
  briefPath: AbsPath,
  sessionName: string,
  shell: string,
  consolidateCmd: string,
): Promise<SpawnConsolidationResult> {
  const cwd = workspace.match[0];
  if (cwd === undefined) {
    // Unreachable in practice — registry validation requires at least one
    // `match` entry, so `expandWorkspace` never produces an empty list — but
    // `match` is typed `readonly AbsPath[]`, not a tuple, so this keeps the
    // function total instead of asserting the first element exists.
    return { ok: false, error: "workspace has no match directory" };
  }
  const prompt = consolidationPrompt(workspace.id, briefPath);
  const inner = consolidationInnerCommand(consolidateCmd, prompt, shell);
  const result = await proc.run(
    "tmux",
    ["new-session", "-d", "-s", sessionName, "-c", cwd, "sh", "-c", inner],
    {},
  );
  if (result.exitCode === 0) return { ok: true };
  return { ok: false, error: result.stderr.trim() };
}
