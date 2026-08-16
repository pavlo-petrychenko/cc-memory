import type { AbsPath } from "@/core/index.ts";
import type { Workspace } from "@/core/index.ts";
import { KbMapService } from "@/modules/note/kbMap.repository.ts";
import type { KbMapInput } from "@/modules/note/services/kbMap.typedefs.ts";

/** One user-facing operation: build the KB top-level map for a workspace. */
export class BuildKbMapUseCase {
  constructor(private readonly kbMapService: KbMapService) {}

  run(workspace: Workspace, home: AbsPath): Promise<KbMapInput | null> {
    return this.kbMapService.build(workspace, home);
  }
}
