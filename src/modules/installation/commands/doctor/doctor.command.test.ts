import { describe, expect, test } from "bun:test";

import { DoctorCommand } from "@/modules/installation/commands/doctor/doctor.command.ts";
import { DoctorFormatter } from "@/modules/installation/doctor/doctor.formatter.ts";
import { DoctorService } from "@/modules/installation/doctor/doctor.useCase.ts";
import { makeProcFake } from "@/testing/fakes/procFake.fake.ts";
import {
  makeNoteModule,
  makeSearchIndex,
  makeWorklogModule,
} from "@/testing/fixtures/retrievalModules.fixture.ts";
import { makeRunContext } from "@/testing/fixtures/runContext.fixture.ts";
import { makeTestGateways } from "@/testing/fixtures/testGateways.fixture.ts";

function makeCommand() {
  const container = makeTestGateways({ proc: makeProcFake() });
  const index = makeSearchIndex(container);
  const note = makeNoteModule(container, index);
  const worklog = makeWorklogModule(container, index);
  const command = new DoctorCommand(
    container,
    new DoctorService(container, note.noteService, worklog.worklogService),
    new DoctorFormatter(),
  );
  return command;
}

describe("DoctorCommand", () => {
  test("prints the registry status and cwd resolution lines first", async () => {
    const result = await makeCommand().run({ cwd: null, prompt: null }, makeRunContext());
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain("registry:");
    expect(result.lines[1]).toContain("cwd ");
  });
});
