import type { Config } from "@/core/config/config.typedefs.ts";
import type { Gateways } from "@/gateways/gateways.typedefs.ts";
import type { SearchIndex } from "@/gateways/searchIndex/searchIndex.typedefs.ts";

/** The dependency-injection context every use case, service, repository and
 * projection is constructed with: the live gateways container, the parsed
 * config, and the shared derived search index (the "models/db" equivalent). */
export interface AppContext {
  gateways: Gateways;
  config: Config;
  searchIndex: SearchIndex;
}
