import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../../src/core/AbsPath.ts";
import { makeEnvFake } from "../../../helpers/fakes/envMap.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above — a fixed test fixture.
const CWD = "/home/test/project" as AbsPath;

describe("envFake", () => {
  test("home and cwd return the constructor arguments", () => {
    const env = makeEnvFake(HOME, CWD);

    expect(env.home()).toBe(HOME);
    expect(env.cwd()).toBe(CWD);
  });

  test("get returns undefined for a variable never set", () => {
    const env = makeEnvFake(HOME, CWD);

    expect(env.get("CCMEM_LINK_BOOST")).toBeUndefined();
  });

  test("set makes a variable visible to get", () => {
    const env = makeEnvFake(HOME, CWD);

    env.set("CCMEM_GATE_DISABLE", "1");

    expect(env.get("CCMEM_GATE_DISABLE")).toBe("1");
  });

  test("unset removes a previously set variable", () => {
    const env = makeEnvFake(HOME, CWD);
    env.set("CCMEM_GATE_DISABLE", "1");

    env.unset("CCMEM_GATE_DISABLE");

    expect(env.get("CCMEM_GATE_DISABLE")).toBeUndefined();
  });

  test("setHome/setCwd override the initial values", () => {
    const env = makeEnvFake(HOME, CWD);
    // SAFETY: fixed test fixture.
    const otherHome = "/home/other" as AbsPath;

    env.setHome(otherHome);
    env.setCwd(otherHome);

    expect(env.home()).toBe(otherHome);
    expect(env.cwd()).toBe(otherHome);
  });
});
