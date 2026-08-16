import type { AppContext } from "./context.typedefs.ts";

export abstract class Repository {
  protected readonly gateways: AppContext["gateways"];
  protected readonly config: AppContext["config"];

  constructor(ctx: AppContext) {
    this.gateways = ctx.gateways;
    this.config = ctx.config;
  }
}
