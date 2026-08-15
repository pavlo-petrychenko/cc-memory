import type { AbsPath } from "@/core/index.ts";
import { expandPath, indexDbPath, joinAbs, titleize, tildify } from "@/core/index.ts";
import type { RawWorkspace } from "@/core/index.ts";
import type { Result } from "@/core/index.ts";
import { WorkspaceRepository } from "@/modules/workspace/registry/workspace.repository.ts";
import { WorkspaceValidatorService } from "@/modules/workspace/resolution/workspace.validator.service.ts";
import { DEFAULT_EXCLUDE } from "@/modules/workspace/workspace.constants.ts";
import type { WorkspaceIndexBuilder } from "@/modules/workspace/workspace.typedefs.ts";

export type AddWorkspaceInput = {
  readonly id: string;
  readonly match: readonly string[];
  readonly kb: string | null;
  readonly worklogs: string | null;
  readonly exclude: readonly string[] | null;
};

export type AddWorkspaceReport = {
  readonly id: string;
  readonly kb: AbsPath;
  readonly worklogs: AbsPath;
  readonly indexDb: AbsPath;
  readonly total: number;
  readonly match: readonly AbsPath[];
};

/** One user-facing operation: register + scaffold a new workspace. */
export class AddWorkspaceUseCase {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly validatorService: WorkspaceValidatorService,
    private readonly indexBuilder: WorkspaceIndexBuilder,
  ) {}

  async run(
    home: AbsPath,
    input: AddWorkspaceInput,
  ): Promise<Result<AddWorkspaceReport, string>> {
    const registryResult = await this.repository.load(this.repository.defaultPath(home));
    if (!registryResult.ok) {
      return { ok: false, error: `registry error: ${registryResult.error.message}` };
    }
    const existing = registryResult.value;

    const title = titleize(input.id);
    const kb = expandPath(input.kb ?? `~/Documents/${title} Vault`, home);
    const worklogs =
      input.worklogs !== null
        ? expandPath(input.worklogs, home)
        : joinAbs(kb, "_Worklogs");
    const indexDb = indexDbPath(home, input.id);
    const match = input.match.map((entry) => expandPath(entry, home));
    const exclude =
      input.exclude !== null && input.exclude.length > 0
        ? input.exclude
        : DEFAULT_EXCLUDE;

    const candidate: RawWorkspace = {
      id: input.id,
      match,
      kb,
      worklogs,
      exclude,
      indexDb,
    };
    const conflicts = this.validatorService.validateNew(candidate, existing, home);
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: `workspace '${input.id}' conflicts with an existing workspace`,
      };
    }

    await this.repository.scaffold(kb, worklogs, indexDb, title, input.id);

    const stored: RawWorkspace = {
      id: candidate.id,
      match: match.map((entry) => tildify(entry, home)),
      kb: tildify(kb, home),
      worklogs: tildify(worklogs, home),
      exclude: candidate.exclude,
      indexDb: tildify(indexDb, home),
    };
    await this.repository.save(this.repository.defaultPath(home), [...existing, stored]);
    const total = await this.indexBuilder.buildIndex(
      this.validatorService.expandWorkspace(stored, home),
    );

    return { ok: true, value: { id: input.id, kb, worklogs, indexDb, total, match } };
  }
}
