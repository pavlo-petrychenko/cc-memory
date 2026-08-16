import { Hook } from "@/core/index.ts";
import { HookEvent, HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { SessionStartUseCase } from "@/modules/memory/useCases/sessionStart.useCase.ts";

@Hook({
  name: HookName.SessionStart,
  event: HookEvent.SessionStart,
  timeoutSeconds: 10,
  Handler: SessionStartUseCase,
  mapOptions: (_record, workspace, cwd) => ({ workspace, cwd }),
})
export class SessionStartHookResolver {}
