import { describe, expect, test } from "bun:test";

import { CliCommand, parseArgs } from "../../src/cli/args.ts";
import { help, version } from "../../src/cli/help.command.ts";
import { CC_MEMORY_VERSION } from "../../src/version.ts";
import { makeIoFake } from "../helpers/fakes/ioFake.fake.ts";

/**
 * `-h`/`--help` and the no-arguments usage dump have no built-in parser
 * support here, so they must be handled explicitly — without this,
 * `memory --help` would exit 2 with "unknown command: --help".
 */
describe("help and version parsing", () => {
  const helpForms = ["-h", "--help"];
  for (const form of helpForms) {
    test(`${form} parses as the help command`, () => {
      const parsed = parseArgs([form]);
      expect(parsed).toEqual({ ok: true, value: { command: CliCommand.Help } });
    });
  }

  test("no arguments at all is help", () => {
    expect(parseArgs([])).toEqual({ ok: true, value: { command: CliCommand.Help } });
  });

  const versionForms = ["-V", "--version"];
  for (const form of versionForms) {
    test(`${form} parses as the version command`, () => {
      const parsed = parseArgs([form]);
      expect(parsed).toEqual({ ok: true, value: { command: CliCommand.Version } });
    });
  }

  test("an actually-unknown command still fails, and names itself", () => {
    const parsed = parseArgs(["bogus"]);
    expect(parsed).toEqual({ ok: false, error: { message: "unknown command: bogus" } });
  });
});

describe("help output", () => {
  test("exits 0 and lists every command", () => {
    const stdio = makeIoFake();
    const outcome = help(stdio);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderrMessage).toBeNull();

    const written = stdio.written.join("");
    for (const invocation of [
      "memory workspace add",
      "memory workspace rm",
      "memory workspace ls",
      "memory resolve",
      "memory reindex",
      "memory search",
      "memory notes",
      "memory commit",
      "memory reflect",
      "memory doctor",
      "memory install",
    ]) {
      expect(written).toContain(invocation);
    }
  });

  test("documents every CCMEM_* environment variable", () => {
    const stdio = makeIoFake();
    help(stdio);
    const written = stdio.written.join("");
    for (const variable of [
      "CCMEM_INJECT_MIN_SCORE",
      "CCMEM_LINK_BOOST",
      "CCMEM_INJECT_LOG",
      "CCMEM_BLOCK_AFTER",
      "CCMEM_BLOCK_DRIFT",
      "CCMEM_GATE_DISABLE",
      "CCMEM_CONSOLIDATE_CMD",
      "CCMEM_LOG_LEVEL",
    ]) {
      expect(written).toContain(variable);
    }
  });
});

describe("version output", () => {
  test("prints the version and exits 0", () => {
    const stdio = makeIoFake();
    const outcome = version(stdio);
    expect(outcome.exitCode).toBe(0);
    expect(stdio.written.join("")).toBe(`memory ${CC_MEMORY_VERSION}\n`);
  });
});
