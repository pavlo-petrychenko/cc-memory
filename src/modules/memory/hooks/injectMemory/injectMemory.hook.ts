import { Hook } from "@/core/index.ts";
import { PayloadParser } from "@/core/index.ts";
import { HookEvent, HookName } from "@/core/transport/hook/hook.typedefs.ts";
import { InjectMemoryUseCase } from "@/modules/memory/useCases/injectMemory.useCase.ts";

const parser = new PayloadParser();

@Hook({
  name: HookName.MemoryInject,
  event: HookEvent.UserPromptSubmit,
  timeoutSeconds: 15,
  Handler: InjectMemoryUseCase,
  mapOptions: (record, workspace, cwd) => {
    const parsed = parser.parseMemoryInject(record);
    return { workspace, cwd, prompt: parsed.prompt };
  },
})
export class InjectMemoryHookResolver {}
