import type { Result } from "../core/Result.ts";

/**
 * Hand-written CLI argument parser: `node:util.parseArgs` cannot express
 * `nargs="+"` (a required, space-separated list: `--match ~/a ~/b`), which is
 * the invocation shape the CLI needs to support.
 *
 * Deliberately simpler than a general parser in one way: every flag here is
 * expected AFTER its command's positional argument(s) — this parser does not
 * support a flag preceding a positional. Nothing this CLI does needs that
 * generality.
 */

/** The closed set of subcommands. */
export enum CliCommand {
  WorkspaceAdd = "workspace_add",
  WorkspaceRm = "workspace_rm",
  WorkspaceLs = "workspace_ls",
  Resolve = "resolve",
  Reindex = "reindex",
  Search = "search",
  Notes = "notes",
  Commit = "commit",
  Doctor = "doctor",
  Hook = "hook",
  Install = "install",
  Uninstall = "uninstall",
  /** `-h`/`--help`, or no arguments at all. */
  Help = "help",
  Version = "version",
}

export type WorkspaceAddArgs = {
  readonly command: CliCommand.WorkspaceAdd;
  readonly id: string;
  readonly match: readonly string[];
  readonly kb: string | null;
  readonly worklogs: string | null;
  readonly exclude: readonly string[] | null;
};

export type WorkspaceRmArgs = {
  readonly command: CliCommand.WorkspaceRm;
  readonly id: string;
  readonly purge: boolean;
};

export type WorkspaceLsArgs = { readonly command: CliCommand.WorkspaceLs };

export type ResolveArgs = {
  readonly command: CliCommand.Resolve;
  readonly cwd: string | null;
};

export type ReindexArgs = {
  readonly command: CliCommand.Reindex;
  readonly workspace: string | null;
  readonly full: boolean;
};

export type SearchArgs = {
  readonly command: CliCommand.Search;
  readonly query: string;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly limit: number;
  readonly worklog: boolean;
};

export type NotesArgs = {
  readonly command: CliCommand.Notes;
  readonly workspace: string | null;
  readonly cwd: string | null;
  readonly folder: string | null;
  readonly json: boolean;
};

export type CommitArgs = {
  readonly command: CliCommand.Commit;
  readonly workspace: string | null;
  readonly message: string | null;
};

export type DoctorArgs = {
  readonly command: CliCommand.Doctor;
  readonly cwd: string | null;
  readonly prompt: string | null;
};

export type HookArgs = { readonly command: CliCommand.Hook; readonly name: string };

export type InstallArgs = {
  readonly command: CliCommand.Install;
  readonly dryRun: boolean;
};

export type UninstallArgs = { readonly command: CliCommand.Uninstall };

export type HelpArgs = { readonly command: CliCommand.Help };

export type VersionArgs = { readonly command: CliCommand.Version };

export type ParsedArgs =
  | WorkspaceAddArgs
  | WorkspaceRmArgs
  | WorkspaceLsArgs
  | ResolveArgs
  | ReindexArgs
  | SearchArgs
  | NotesArgs
  | CommitArgs
  | DoctorArgs
  | HookArgs
  | InstallArgs
  | UninstallArgs
  | HelpArgs
  | VersionArgs;

export type ArgsError = { readonly message: string };

function fail(message: string): Result<ParsedArgs, ArgsError> {
  return { ok: false, error: { message } };
}

function ok(value: ParsedArgs): Result<ParsedArgs, ArgsError> {
  return { ok: true, value };
}

/** True for anything this parser treats as a flag boundary — every flag is a
 * long (`--foo`) or short (`-k`/`-m`) option; nothing here is ever mistaken
 * for a positional because positionals are always consumed BEFORE
 * flag-scanning starts (see the module doc comment). */
function isFlagToken(token: string): boolean {
  return token.startsWith("-");
}

function hasFlag(tokens: readonly string[], flag: string): boolean {
  return tokens.includes(flag);
}

/** The value immediately following `flag`, or `null` if `flag` is absent
 * (single-value options: `--kb PATH`, `-k N`, ...). */
function findFlagValue(tokens: readonly string[], flag: string): string | null {
  const index = tokens.indexOf(flag);
  if (index === -1) return null;
  return tokens[index + 1] ?? null;
}

/**
 * Every token after `flag` up to the next flag or the end of `tokens` — the
 * space-separated, variadic-value shape (`--match a b`, `--exclude`). Returns
 * `null` when `flag` is absent at all, distinct from present-but-empty: a
 * caller that wants an explicit empty `--exclude` treated the same as an
 * omitted one applies that fallback itself, not this parser.
 */
function findVariadicValues(
  tokens: readonly string[],
  flag: string,
): readonly string[] | null {
  const index = tokens.indexOf(flag);
  if (index === -1) return null;
  const values: string[] = [];
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token === undefined || isFlagToken(token)) break;
    values.push(token);
  }
  return values;
}

function parseIntFlag(
  tokens: readonly string[],
  flag: string,
  fallback: number,
): Result<number, string> {
  const raw = findFlagValue(tokens, flag);
  if (raw === null) return { ok: true, value: fallback };
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: `${flag}: expected an integer, got "${raw}"` };
  }
  return { ok: true, value: parsed };
}

function parseWorkspaceAdd(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const id = tokens[0];
  if (id === undefined) return fail("workspace add: missing <id>");
  const rest = tokens.slice(1);
  const match = findVariadicValues(rest, "--match");
  if (match === null || match.length === 0) {
    return fail("workspace add: --match requires at least one path");
  }
  return ok({
    command: CliCommand.WorkspaceAdd,
    id,
    match,
    kb: findFlagValue(rest, "--kb"),
    worklogs: findFlagValue(rest, "--worklogs"),
    exclude: findVariadicValues(rest, "--exclude"),
  });
}

function parseWorkspaceRm(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const id = tokens[0];
  if (id === undefined) return fail("workspace rm: missing <id>");
  return ok({
    command: CliCommand.WorkspaceRm,
    id,
    purge: hasFlag(tokens.slice(1), "--purge"),
  });
}

function parseWorkspace(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const [subcommand, ...rest] = tokens;
  switch (subcommand) {
    case "add":
      return parseWorkspaceAdd(rest);
    case "rm":
      return parseWorkspaceRm(rest);
    case "ls":
      return ok({ command: CliCommand.WorkspaceLs });
    default:
      return fail(`workspace: unknown subcommand "${subcommand ?? ""}" (want add/rm/ls)`);
  }
}

function parseResolve(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const cwd = tokens[0];
  return ok({
    command: CliCommand.Resolve,
    cwd: cwd !== undefined && !isFlagToken(cwd) ? cwd : null,
  });
}

function parseReindex(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const first = tokens[0];
  const hasPositional = first !== undefined && !isFlagToken(first);
  const rest = hasPositional ? tokens.slice(1) : tokens;
  return ok({
    command: CliCommand.Reindex,
    workspace: hasPositional ? (first ?? null) : null,
    full: hasFlag(rest, "--full"),
  });
}

function parseSearch(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const query = tokens[0];
  if (query === undefined) return fail("search: missing <query>");
  const rest = tokens.slice(1);
  const limitResult = parseIntFlag(rest, "-k", 5);
  if (!limitResult.ok) return fail(limitResult.error);
  return ok({
    command: CliCommand.Search,
    query,
    workspace: findFlagValue(rest, "--workspace"),
    cwd: findFlagValue(rest, "--cwd"),
    limit: limitResult.value,
    worklog: hasFlag(rest, "--worklog"),
  });
}

function parseNotes(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  return ok({
    command: CliCommand.Notes,
    workspace: findFlagValue(tokens, "--workspace"),
    cwd: findFlagValue(tokens, "--cwd"),
    folder: findFlagValue(tokens, "--folder"),
    json: hasFlag(tokens, "--json"),
  });
}

function parseCommit(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const first = tokens[0];
  const hasPositional = first !== undefined && !isFlagToken(first);
  const rest = hasPositional ? tokens.slice(1) : tokens;
  const message = findFlagValue(rest, "-m") ?? findFlagValue(rest, "--message");
  return ok({
    command: CliCommand.Commit,
    workspace: hasPositional ? (first ?? null) : null,
    message,
  });
}

function parseDoctor(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  return ok({
    command: CliCommand.Doctor,
    cwd: findFlagValue(tokens, "--cwd"),
    prompt: findFlagValue(tokens, "--prompt"),
  });
}

function parseHook(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  const name = tokens[0];
  if (name === undefined) return fail("hook: missing <name>");
  return ok({ command: CliCommand.Hook, name });
}

function parseInstall(tokens: readonly string[]): Result<ParsedArgs, ArgsError> {
  return ok({ command: CliCommand.Install, dryRun: hasFlag(tokens, "--dry-run") });
}

/**
 * Parse a full `argv` (already stripped of the `node`/`bun`/script leader —
 * callers pass `process.argv.slice(2)`) into one `ParsedArgs`. This only
 * parses; dispatch is `main.ts`'s job.
 */
export function parseArgs(argv: readonly string[]): Result<ParsedArgs, ArgsError> {
  const [command, ...rest] = argv;
  switch (command) {
    case "workspace":
      return parseWorkspace(rest);
    case "resolve":
      return parseResolve(rest);
    case "reindex":
      return parseReindex(rest);
    case "search":
      return parseSearch(rest);
    case "notes":
      return parseNotes(rest);
    case "commit":
      return parseCommit(rest);
    case "doctor":
      return parseDoctor(rest);
    case "hook":
      return parseHook(rest);
    case "install":
      return parseInstall(rest);
    case "uninstall":
      return ok({ command: CliCommand.Uninstall });
    // A hand-rolled parser has to handle these explicitly, or `memory --help`
    // would exit 2 with "unknown command: --help".
    case "-h":
    case "--help":
    case undefined:
      return ok({ command: CliCommand.Help });
    case "-V":
    case "--version":
      return ok({ command: CliCommand.Version });
    default:
      return fail(`unknown command: ${command}`);
  }
}
