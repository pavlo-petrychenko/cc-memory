import type {
  ProjectionConstructor,
  RepositoryConstructor,
} from "./constructor.typedefs.ts";
import type { AppContext } from "./context.typedefs.ts";
import type { Projection } from "./projection.base.ts";
import type { Repository } from "./repository.base.ts";

export abstract class Service {
  protected readonly gateways: AppContext["gateways"];
  protected readonly config: AppContext["config"];

  constructor(ctx: AppContext) {
    this.gateways = ctx.gateways;
    this.config = ctx.config;
  }

  protected makeRepository<T extends Repository>(Ctor: RepositoryConstructor<T>): T {
    return new Ctor({ gateways: this.gateways, config: this.config });
  }

  protected makeProjection<T extends Projection>(Ctor: ProjectionConstructor<T>): T {
    return new Ctor({ gateways: this.gateways, config: this.config });
  }
}
