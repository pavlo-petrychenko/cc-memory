import { Hook } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookEvent, HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { WriteStateFloorUseCase } from "@/modules/worklog/useCases/writeStateFloor.useCase.ts";

const parser = new PayloadParser();

@Hook({
  name: HookName.WorklogFloor,
  event: HookEvent.SessionEnd,
  timeoutSeconds: 15,
  Handler: WriteStateFloorUseCase,
  mapOptions: (record, workspace, cwd) => {
    const parsed = parser.parseWorklogFloor(record);
    return { workspace, cwd, reason: parsed.reason };
  },
})
export class WorklogFloorHookResolver {}
