/**
 * The full C3 invocation table ([[contracts]]) against `src/cli/args.ts`'s
 * hand-written parser. Table-driven, per CLAUDE.md's testing conventions.
 * Placed under `tests/unit/domain/` per this packet's own "Tests" section,
 * even though `args.ts` lives under `src/cli/` (it has no I/O, so it would fit
 * `core/` just as well; the plan's file table puts it in `cli/`
 * regardless — this test's location is transcribed as specified).
 */
import { describe, expect, test } from "bun:test";

import { CliCommand, parseArgs, type ParsedArgs } from "../../src/cli/args.ts";

type Case = {
  readonly name: string;
  readonly argv: readonly string[];
  readonly expected: ParsedArgs;
};

const CASES: readonly Case[] = [
  {
    name: "workspace add — required --match only",
    argv: ["workspace", "add", "mate", "--match", "/repo/a"],
    expected: {
      command: CliCommand.WorkspaceAdd,
      id: "mate",
      match: ["/repo/a"],
      kb: null,
      worklogs: null,
      exclude: null,
    },
  },
  {
    name: "workspace add — space-separated variadic --match (multiple paths)",
    argv: ["workspace", "add", "mate", "--match", "/repo/a", "/repo/b"],
    expected: {
      command: CliCommand.WorkspaceAdd,
      id: "mate",
      match: ["/repo/a", "/repo/b"],
      kb: null,
      worklogs: null,
      exclude: null,
    },
  },
  {
    name: "workspace add — every optional flag",
    argv: [
      "workspace",
      "add",
      "mate",
      "--match",
      "/repo/a",
      "--kb",
      "/vault",
      "--worklogs",
      "/vault/_Worklogs",
      "--exclude",
      "Archive",
      ".obsidian",
    ],
    expected: {
      command: CliCommand.WorkspaceAdd,
      id: "mate",
      match: ["/repo/a"],
      kb: "/vault",
      worklogs: "/vault/_Worklogs",
      exclude: ["Archive", ".obsidian"],
    },
  },
  {
    name: "workspace rm — bare",
    argv: ["workspace", "rm", "mate"],
    expected: { command: CliCommand.WorkspaceRm, id: "mate", purge: false },
  },
  {
    name: "workspace rm --purge",
    argv: ["workspace", "rm", "mate", "--purge"],
    expected: { command: CliCommand.WorkspaceRm, id: "mate", purge: true },
  },
  {
    name: "workspace ls",
    argv: ["workspace", "ls"],
    expected: { command: CliCommand.WorkspaceLs },
  },
  {
    name: "resolve — no cwd (default to process cwd downstream)",
    argv: ["resolve"],
    expected: { command: CliCommand.Resolve, cwd: null },
  },
  {
    name: "resolve [cwd]",
    argv: ["resolve", "/some/dir"],
    expected: { command: CliCommand.Resolve, cwd: "/some/dir" },
  },
  {
    name: "reindex — no workspace, no flags",
    argv: ["reindex"],
    expected: { command: CliCommand.Reindex, workspace: null, full: false },
  },
  {
    name: "reindex [workspace] --full",
    argv: ["reindex", "mate", "--full"],
    expected: { command: CliCommand.Reindex, workspace: "mate", full: true },
  },
  {
    name: "search <query> — defaults",
    argv: ["search", "kryptonite"],
    expected: {
      command: CliCommand.Search,
      query: "kryptonite",
      workspace: null,
      cwd: null,
      limit: 5,
      worklog: false,
    },
  },
  {
    name: "search — every optional flag",
    argv: [
      "search",
      "kryptonite",
      "--workspace",
      "primary",
      "--cwd",
      "/",
      "-k",
      "1",
      "--worklog",
    ],
    expected: {
      command: CliCommand.Search,
      query: "kryptonite",
      workspace: "primary",
      cwd: "/",
      limit: 1,
      worklog: true,
    },
  },
  {
    name: "notes — defaults",
    argv: ["notes"],
    expected: {
      command: CliCommand.Notes,
      workspace: null,
      cwd: null,
      folder: null,
      json: false,
    },
  },
  {
    name: "notes --folder F --json",
    argv: ["notes", "--folder", "Alpha", "--json"],
    expected: {
      command: CliCommand.Notes,
      workspace: null,
      cwd: null,
      folder: "Alpha",
      json: true,
    },
  },
  {
    name: "notes --workspace ID --cwd PATH",
    argv: ["notes", "--workspace", "primary", "--cwd", "/some/dir"],
    expected: {
      command: CliCommand.Notes,
      workspace: "primary",
      cwd: "/some/dir",
      folder: null,
      json: false,
    },
  },
  {
    name: "commit — no workspace, no message",
    argv: ["commit"],
    expected: { command: CliCommand.Commit, workspace: null, message: null },
  },
  {
    name: "commit [workspace] -m MSG",
    argv: ["commit", "primary", "-m", "wip"],
    expected: { command: CliCommand.Commit, workspace: "primary", message: "wip" },
  },
  {
    name: "commit --message MSG (long form)",
    argv: ["commit", "--message", "wip"],
    expected: { command: CliCommand.Commit, workspace: null, message: "wip" },
  },
  {
    name: "reflect — defaults",
    argv: ["reflect"],
    expected: {
      command: CliCommand.Reflect,
      workspace: null,
      all: false,
      ifDue: false,
      thresholdHours: 20,
      headless: false,
      force: false,
    },
  },
  {
    name: "reflect — every flag",
    argv: [
      "reflect",
      "--workspace",
      "primary",
      "--all",
      "--if-due",
      "--threshold-hours",
      "5",
      "--headless",
      "--force",
    ],
    expected: {
      command: CliCommand.Reflect,
      workspace: "primary",
      all: true,
      ifDue: true,
      thresholdHours: 5,
      headless: true,
      force: true,
    },
  },
  {
    name: "doctor — defaults",
    argv: ["doctor"],
    expected: { command: CliCommand.Doctor, cwd: null, prompt: null },
  },
  {
    name: "doctor --cwd PATH --prompt TEXT",
    argv: ["doctor", "--cwd", "/some/dir", "--prompt", "how does wrap-gate work"],
    expected: {
      command: CliCommand.Doctor,
      cwd: "/some/dir",
      prompt: "how does wrap-gate work",
    },
  },
  {
    name: "hook <name> (additive)",
    argv: ["hook", "session-start"],
    expected: { command: CliCommand.Hook, name: "session-start" },
  },
  {
    name: "install (additive)",
    argv: ["install"],
    expected: { command: CliCommand.Install, dryRun: false },
  },
  {
    name: "install --dry-run",
    argv: ["install", "--dry-run"],
    expected: { command: CliCommand.Install, dryRun: true },
  },
  {
    name: "uninstall (additive)",
    argv: ["uninstall"],
    expected: { command: CliCommand.Uninstall },
  },
];

describe("parseArgs — the full C3 invocation table", () => {
  for (const { name, argv, expected } of CASES) {
    test(name, () => {
      const result = parseArgs(argv);
      expect(result).toEqual({ ok: true, value: expected });
    });
  }
});

describe("parseArgs — error paths", () => {
  test("unknown top-level command", () => {
    const result = parseArgs(["frobnicate"]);
    expect(result.ok).toBe(false);
  });

  // No arguments is NOT an error: argparse printed usage and exited 0 for a bare
  // `memory`, so it parses as the help command. See help.command.test.ts.
  test("no command at all is help, not a parse error", () => {
    const result = parseArgs([]);
    expect(result).toEqual({ ok: true, value: { command: CliCommand.Help } });
  });

  test("workspace add without --match fails", () => {
    const result = parseArgs(["workspace", "add", "mate"]);
    expect(result.ok).toBe(false);
  });

  test("workspace add without an id fails", () => {
    const result = parseArgs(["workspace", "add"]);
    expect(result.ok).toBe(false);
  });

  test("workspace with an unknown subcommand fails", () => {
    const result = parseArgs(["workspace", "frobnicate"]);
    expect(result.ok).toBe(false);
  });

  test("search without a query fails", () => {
    const result = parseArgs(["search"]);
    expect(result.ok).toBe(false);
  });

  test("search -k with a non-integer value fails", () => {
    const result = parseArgs(["search", "q", "-k", "not-a-number"]);
    expect(result.ok).toBe(false);
  });

  test("reflect --threshold-hours with a non-integer value fails", () => {
    const result = parseArgs(["reflect", "--threshold-hours", "soon"]);
    expect(result.ok).toBe(false);
  });

  test("hook without a name fails", () => {
    const result = parseArgs(["hook"]);
    expect(result.ok).toBe(false);
  });
});
