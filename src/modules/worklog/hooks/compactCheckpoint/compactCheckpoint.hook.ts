import { Hook } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookEvent, HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { AppendCompactUseCase } from "@/modules/worklog/useCases/appendCompact.useCase.ts";

const parser = new PayloadParser();

@Hook({
  name: HookName.CompactCheckpoint,
  event: HookEvent.PostCompact,
  timeoutSeconds: 15,
  Handler: AppendCompactUseCase,
  mapOptions: (record, workspace, cwd) => {
    const parsed = parser.parseCompactCheckpoint(record);
    return {
      workspace,
      cwd,
      compactSummary: parsed.compactSummary,
      trigger: parsed.trigger,
    };
  },
})
export class CompactCheckpointHookResolver {}
