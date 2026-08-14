import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";

import { makeEnvProcessAdapter } from "../../../src/platform/envProcess.adapter.ts";

const PROBE_VAR = "CCMEM_TEST_ENV_PROCESS_PROBE";

afterEach(() => {
  delete process.env[PROBE_VAR];
});

describe("envProcess adapter", () => {
  test("get reads a real environment variable", () => {
    process.env[PROBE_VAR] = "hello";
    const env = makeEnvProcessAdapter();

    expect(env.get(PROBE_VAR)).toBe("hello");
  });

  test("get returns undefined for a variable that isn't set", () => {
    const env = makeEnvProcessAdapter();

    expect(env.get(PROBE_VAR)).toBeUndefined();
  });

  test("home matches node:os's homedir", () => {
    const env = makeEnvProcessAdapter();

    expect(String(env.home())).toBe(homedir());
  });

  test("cwd matches the real process cwd", () => {
    const env = makeEnvProcessAdapter();

    expect(String(env.cwd())).toBe(process.cwd());
  });
});
