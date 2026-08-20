import { describe, expect, test } from "bun:test";

import { ServeCommand, parseServeOptions } from "@/app/commands/serve/serve.command.ts";
import { ServeUseCase } from "@/app/commands/serve/serve.useCase.ts";
import { registerCommands } from "@/core/index.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

describe("parseServeOptions", () => {
  test("defaults to 3413 and 127.0.0.1", () => {
    const result = parseServeOptions([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.port).toBe(ServeUseCase.DEFAULT_PORT);
      expect(result.value.host).toBe(ServeUseCase.DEFAULT_HOST);
      expect(result.value.open).toBe(false);
    }
  });

  test("parses --port and --host", () => {
    const result = parseServeOptions(["--port", "4000", "--host", "0.0.0.0", "--open"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.port).toBe(4000);
      expect(result.value.host).toBe("0.0.0.0");
      expect(result.value.open).toBe(true);
    }
  });

  test("rejects invalid --port", () => {
    const result = parseServeOptions(["--port", "bad"]);
    expect(result.ok).toBe(false);
  });

  test("rejects empty --host", () => {
    const result = parseServeOptions(["--host", ""]);
    expect(result.ok).toBe(false);
  });
});

describe("ServeCommand", () => {
  test("invalid --port maps to exit 2", async () => {
    const ctx = makeAppContext({}, undefined);
    const [handler] = registerCommands([ServeCommand], ctx);
    if (handler === undefined) throw new Error("expected handler");
    const result = await handler.invoke(["--port", "not-a-number"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderrMessage).toContain("invalid --port");
  });
});
