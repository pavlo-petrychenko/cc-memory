import type { JsonObject } from "@/install/utils/jsonFile/index.ts";

export type HookPurgeSummary = {
  readonly purgedByManifestCount: number;
  readonly purgedByLegacyCount: number;
};

/** Named return contract for `purgeOurHooks` — an inline object-literal return
 * type discards the evidence TypeScript already has (anti-slop
 * `no-known-value-widening`); this is that owner type. */
export type PurgeHooksResult = {
  readonly hooks: JsonObject;
  readonly summary: HookPurgeSummary;
};

/** Named return contract for `registerOurHooks`, same reasoning as
 * `PurgeHooksResult` above. */
export type RegisterHooksResult = {
  readonly hooks: JsonObject;
  readonly hookCommands: Readonly<Record<string, string>>;
};

export type HookSurgeryResult = {
  readonly settings: JsonObject;
  readonly hookCommands: Readonly<Record<string, string>>;
  readonly summary: HookPurgeSummary;
};
