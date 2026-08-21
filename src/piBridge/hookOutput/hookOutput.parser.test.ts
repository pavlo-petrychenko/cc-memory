import { describe, expect, test } from "bun:test";

import { HookOutputParser } from "@/piBridge/hookOutput/hookOutput.parser.ts";
import { ParsedHookOutputKind } from "@/piBridge/piBridge.typedefs.ts";

const parser = new HookOutputParser();

describe("HookOutputParser", () => {
  test("empty and whitespace-only stdout decode to Silent", () => {
    expect(parser.parse("")).toEqual({ kind: ParsedHookOutputKind.Silent });
    expect(parser.parse("   \n  ")).toEqual({ kind: ParsedHookOutputKind.Silent });
  });

  test("malformed JSON and non-object JSON decode to Silent", () => {
    expect(parser.parse("{not json")).toEqual({ kind: ParsedHookOutputKind.Silent });
    expect(parser.parse("[1,2]")).toEqual({ kind: ParsedHookOutputKind.Silent });
    expect(parser.parse("42")).toEqual({ kind: ParsedHookOutputKind.Silent });
  });

  test("a block decision carries its reason", () => {
    const raw = JSON.stringify({ decision: "block", reason: "write the worklog" });
    expect(parser.parse(raw)).toEqual({
      kind: ParsedHookOutputKind.Block,
      reason: "write the worklog",
    });
  });

  test("a block decision without a string reason falls through to Silent", () => {
    const raw = JSON.stringify({ decision: "block", reason: 7 });
    expect(parser.parse(raw)).toEqual({ kind: ParsedHookOutputKind.Silent });
  });

  test("additionalContext decodes as Context text", () => {
    const raw = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "KB map",
      },
    });
    expect(parser.parse(raw)).toEqual({
      kind: ParsedHookOutputKind.Context,
      text: "KB map",
    });
  });

  test("an empty or non-string additionalContext decodes to Silent", () => {
    expect(
      parser.parse(JSON.stringify({ hookSpecificOutput: { additionalContext: "" } })),
    ).toEqual({ kind: ParsedHookOutputKind.Silent });
    expect(
      parser.parse(JSON.stringify({ hookSpecificOutput: { additionalContext: null } })),
    ).toEqual({ kind: ParsedHookOutputKind.Silent });
  });

  test("unrecognized objects decode to Silent", () => {
    expect(parser.parse(JSON.stringify({ continue: false }))).toEqual({
      kind: ParsedHookOutputKind.Silent,
    });
  });
});
