import { describe, expect, test } from "bun:test";

import { makeIoFake } from "../../../helpers/fakes/ioFake.fake.ts";

describe("ioFake", () => {
  test("readStdin resolves with an empty string by default", async () => {
    const stdio = makeIoFake();

    expect(await stdio.readStdin()).toBe("");
  });

  test("the constructor argument seeds stdin", async () => {
    const stdio = makeIoFake('{"cwd":"/repo"}');

    expect(await stdio.readStdin()).toBe('{"cwd":"/repo"}');
  });

  test("setStdin overrides what readStdin resolves with", async () => {
    const stdio = makeIoFake();

    stdio.setStdin('{"session_id":"abc"}');

    expect(await stdio.readStdin()).toBe('{"session_id":"abc"}');
  });

  test("write collects every call in order", () => {
    const stdio = makeIoFake();

    stdio.write("first");
    stdio.write("second");

    expect(stdio.written).toEqual(["first", "second"]);
  });

  test("exitCode starts null and reflects the last exit call", () => {
    const stdio = makeIoFake();

    expect(stdio.exitCode).toBeNull();

    stdio.exit(0);

    expect(stdio.exitCode).toBe(0);
  });
});
