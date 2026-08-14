import { afterEach, describe, expect, test } from "bun:test";

import { makeIoProcessAdapter } from "../../../src/platform/ioProcess.adapter.ts";

const realStdinText = Bun.stdin.text.bind(Bun.stdin);
const realStdoutWrite = process.stdout.write.bind(process.stdout);
const realExit = process.exit.bind(process);

afterEach(() => {
  Bun.stdin.text = realStdinText;
  process.stdout.write = realStdoutWrite;
  process.exit = realExit;
});

describe("ioProcess adapter", () => {
  test("readStdin resolves with whatever Bun.stdin.text() produces", async () => {
    Bun.stdin.text = () => Promise.resolve('{"cwd":"/repo"}');
    const stdio = makeIoProcessAdapter();

    expect(await stdio.readStdin()).toBe('{"cwd":"/repo"}');
  });

  test("write sends the text to process.stdout with a trailing newline", () => {
    const written: string[] = [];
    // SAFETY: test-only monkeypatch of the real stdout stream, restored in
    // `afterEach` — not a module mock (anti-slop's `no-module-mocking` targets
    // `vi.mock`/`jest.mock`-style import interception, not this).
    process.stdout.write = ((chunk: string) => {
      written.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    const stdio = makeIoProcessAdapter();

    stdio.write('{"decision":"block"}');

    expect(written).toEqual(['{"decision":"block"}\n']);
  });

  test("exit forwards the code to process.exit", () => {
    let capturedCode: number | undefined;
    const fakeExit = (code?: number) => {
      capturedCode = code;
      // SAFETY: this mock deliberately returns instead of exiting, so the
      // test process keeps running; `never` here only needs to satisfy
      // `process.exit`'s return type for this one call site, not actually
      // diverge.
      return undefined as never;
    };
    // SAFETY: test-only monkeypatch of the real process exit, restored in
    // `afterEach` — not a module mock (anti-slop's `no-module-mocking` targets
    // `vi.mock`/`jest.mock`-style import interception, not this).
    process.exit = fakeExit as typeof process.exit;
    const stdio = makeIoProcessAdapter();

    stdio.exit(0);

    expect(capturedCode).toBe(0);
  });
});
