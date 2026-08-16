import { expect, test } from "bun:test";

import { absPath, expandPath } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import { ListNotesUseCase } from "@/modules/memory/useCases/listNotes.useCase.ts";
import { WorkspaceRepository } from "@/modules/workspace/index.ts";
import { makeFsMemoryFake } from "@/testing/fakes/fsMemory.fake.ts";
import { makeAppContext } from "@/testing/fixtures/testGateways.fixture.ts";

const HOME = absPath("/home/test");
const REGISTRY_PATH = expandPath("~/.claude/memory/registry.toml", HOME);

const PRIMARY: RawWorkspace = {
  id: "w",
  match: ["/home/test/project"],
  kb: "/kb",
  worklogs: "/kb/_Worklogs",
  exclude: [],
  indexDb: "/mem/w/index.db",
};

test("listNotes enumerates vault notes", async () => {
  const fs = makeFsMemoryFake();
  fs.seedFile(absPath("/kb/A.md"), "---\ntype: note\n---\n# A\n");
  const ctx = makeAppContext({ fs });
  await new WorkspaceRepository(ctx).save(REGISTRY_PATH, [PRIMARY]);

  const useCase = new ListNotesUseCase(ctx);
  const result = await useCase.execute({
    cwd: null,
    explicitId: null,
    folder: null,
    json: false,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value).toHaveLength(1);
  expect(result.value[0]).toContain("A.md");
  expect(result.value[0]).toContain("— A");
});
