import { Hook } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookEvent, HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { WrapGateUseCase } from "@/modules/worklog/useCases/wrapGate.useCase.ts";

const parser = new PayloadParser();

@Hook({
  name: HookName.WrapGate,
  event: HookEvent.Stop,
  timeoutSeconds: 15,
  Handler: WrapGateUseCase,
  mapOptions: (record, workspace, cwd) => {
    const parsed = parser.parseWrapGate(record);
    return {
      workspace,
      cwd,
      sessionId: parsed.sessionId,
      stopHookActive: parsed.stopHookActive,
    };
  },
})
export class WrapGateHookResolver {}
