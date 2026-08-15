import { expect, test } from "bun:test";

import { Glob } from "bun";

import { wireCli } from "@/cli/cli.wiring.ts";
import { COMMAND_DESCRIPTORS } from "@/cli/help/help.constants.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

async function readFiles(
  predicate: (path: string) => boolean,
): Promise<readonly string[]> {
  const paths = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)]
    .filter(predicate)
    .toSorted();
  return Promise.all(paths.map(async (path) => Bun.file(SOURCE_ROOT + path).text()));
}

test("every command and hook class carries its metadata decorator", async () => {
  const commandTexts = await readFiles((path) => path.endsWith(".command.ts"));
  const hookTexts = await readFiles((path) => path.endsWith(".hook.ts"));

  expect(commandTexts.length).toBeGreaterThan(10);
  expect(hookTexts.length).toBeGreaterThanOrEqual(5);

  const undecoratedCommands = commandTexts.filter(
    (text) => !text.includes("@Command("),
  ).length;
  const undecoratedHooks = hookTexts.filter((text) => !text.includes("@Hook(")).length;
  expect(undecoratedCommands).toBe(0);
  expect(undecoratedHooks).toBe(0);
});

test("--help lists exactly the wired command registry", () => {
  const container = makeTestGateways({ proc: makeProcFake() });
  const { commands } = wireCli(container);

  const visibleRegistry = commands
    .filter((command) => !command.spec.hidden)
    .map((command) => command.spec.path.join(" "))
    .toSorted();

  const helpSurface = COMMAND_DESCRIPTORS.filter((descriptor) => !descriptor.hidden)
    .map((descriptor) => descriptor.path.join(" "))
    .toSorted();

  expect(visibleRegistry).toEqual(helpSurface);
});
