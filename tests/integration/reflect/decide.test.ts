import { describe, expect, test } from "bun:test";

import { decideWithLlm } from "../../../src/reflect/decide.service.ts";
import { decisionPrompt } from "../../../src/reflect/proposals.renderer.ts";
import type { RelatedNote } from "../../../src/reflect/Reflector.ts";
import { ReflectorAction } from "../../../src/reflect/Reflector.ts";
import type { Candidate } from "../../../src/worklog/Candidate.ts";
import { makeProcFake } from "../../helpers/fakes/procFake.fake.ts";

const CANDIDATES: readonly Candidate[] = [{ text: "some durable fact", src: "wt1/a.md" }];
const RELATED: readonly RelatedNote[] = [];

describe("reflect/decide decideWithLlm", () => {
  test("sends the decision prompt on stdin, not argv, with the 240s timeout", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "[]", stderr: "", exitCode: 0 } });

    await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(proc.calls).toHaveLength(1);
    const call = proc.calls[0];
    expect(call?.command).toBe("claude");
    expect(call?.args).toEqual(["-p"]);
    expect(call?.options.input).toBe(decisionPrompt(CANDIDATES, RELATED));
    expect(call?.options.timeoutMs).toBe(240_000);
  });

  test("happy path: a bare JSON array with no fencing", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout: '[{"action":"NOOP","rationale":"trivial, task-specific"}]',
        stderr: "",
        exitCode: 0,
      },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: true,
      value: [{ action: ReflectorAction.Noop, rationale: "trivial, task-specific" }],
    });
  });

  test("fenced JSON: extracts a ```json code block", async () => {
    const proc = makeProcFake();
    const stdout =
      "Here is my decision:\n\n```json\n" +
      '[{"action":"ADD","title":"X","folder":"CC-memory","importance":7}]\n' +
      "```\n";
    proc.enqueue({ kind: "resolve", result: { stdout, stderr: "", exitCode: 0 } });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: true,
      value: [
        { action: ReflectorAction.Add, title: "X", folder: "CC-memory", importance: 7 },
      ],
    });
  });

  test("prose-wrapped JSON: a balanced array with no fence and a nested bracket", async () => {
    const proc = makeProcFake();
    const stdout =
      'Sure! [{"action":"NOOP","rationale":"see note [1,2] for context"}] Hope that helps.';
    proc.enqueue({ kind: "resolve", result: { stdout, stderr: "", exitCode: 0 } });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: true,
      value: [{ action: ReflectorAction.Noop, rationale: "see note [1,2] for context" }],
    });
  });

  test("the claude binary is missing -> ok:false, raw-candidate fallback territory", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "reject", error: new Error("spawn claude ENOENT") });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result.ok).toBe(false);
  });

  test("a non-zero exit -> ok:false with a truncated stderr excerpt", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "  something went wrong  ", exitCode: 1 },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: false,
      error: "claude -p failed: something went wrong",
    });
  });

  test("no JSON array anywhere in the output -> ok:false", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "I cannot help with that request.", stderr: "", exitCode: 0 },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({ ok: false, error: "no JSON array in model output" });
  });

  test("a balanced bracket span that isn't valid JSON -> ok:false", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "[not valid json,,,]", stderr: "", exitCode: 0 },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: false,
      error: "unable to parse JSON array in model output",
    });
  });

  test("a fenced block that parses but isn't a top-level array -> ok:false", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "```json\n{}\n```", stderr: "", exitCode: 0 },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: false,
      error: "unable to parse JSON array in model output",
    });
  });

  test("an item with an unrecognized action is dropped, valid ones kept", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout: '[{"action":"SKIP"},{"action":"NOOP"}]',
        stderr: "",
        exitCode: 0,
      },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({ ok: true, value: [{ action: ReflectorAction.Noop }] });
  });

  test("a non-object array element (a string, or a nested array) is dropped", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout: '["oops", [1, 2], {"action":"NOOP"}]',
        stderr: "",
        exitCode: 0,
      },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({ ok: true, value: [{ action: ReflectorAction.Noop }] });
  });

  test("UPDATE and INVALIDATE both parse, carrying their `path` field", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: {
        stdout:
          '[{"action":"UPDATE","path":"CC-memory/Existing.md","rationale":"extends it"},' +
          '{"action":"INVALIDATE","path":"CC-memory/Old.md","body":"corrected fact"}]',
        stderr: "",
        exitCode: 0,
      },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: true,
      value: [
        {
          action: ReflectorAction.Update,
          path: "CC-memory/Existing.md",
          rationale: "extends it",
        },
        {
          action: ReflectorAction.Invalidate,
          path: "CC-memory/Old.md",
          body: "corrected fact",
        },
      ],
    });
  });

  test("a quoted `]` inside a string does not end the array early", async () => {
    const proc = makeProcFake();
    const stdout = '[{"action":"NOOP","rationale":"see \\"tag]\\" for context"}]';
    proc.enqueue({ kind: "resolve", result: { stdout, stderr: "", exitCode: 0 } });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({
      ok: true,
      value: [{ action: ReflectorAction.Noop, rationale: 'see "tag]" for context' }],
    });
  });

  test("an unterminated array (no closing bracket at all) -> ok:false", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: '[{"action":"NOOP"', stderr: "", exitCode: 0 },
    });

    const result = await decideWithLlm(proc, CANDIDATES, RELATED);

    expect(result).toEqual({ ok: false, error: "no JSON array in model output" });
  });
});
