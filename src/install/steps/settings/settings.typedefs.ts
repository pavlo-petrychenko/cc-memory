import type { JsonObject } from "@/install/utils/jsonFile/jsonFile.typedefs.ts";

export type HookPurgeSummary = {
  readonly purgedByManifestCount: number;
  readonly purgedByLegacyCount: number;
};

export type PurgeHooksResult = {
  readonly hooks: JsonObject;
  readonly summary: HookPurgeSummary;
};

export type RegisterHooksResult = {
  readonly hooks: JsonObject;
  readonly hookCommands: Readonly<Record<string, string>>;
};

export type HookSurgeryResult = {
  readonly settings: JsonObject;
  readonly hookCommands: Readonly<Record<string, string>>;
  readonly summary: HookPurgeSummary;
};
