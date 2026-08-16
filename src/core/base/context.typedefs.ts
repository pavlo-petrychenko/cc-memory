import type { Config } from "@/core/config/config.typedefs.ts";
import type { Gateways } from "@/gateways/gateways.typedefs.ts";

/** The dependency-injection context every use case, service, repository and
 * projection is constructed with: the live gateways container plus the parsed
 * config. */
export interface AppContext {
  gateways: Gateways;
  config: Config;
}
