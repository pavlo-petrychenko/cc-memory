import type {
  ProjectionConstructor,
  RepositoryConstructor,
  ServiceConstructor,
} from "./constructor.typedefs.ts";
import type { AppContext } from "./context.typedefs.ts";
import type { Projection } from "./projection.base.ts";
import type { Repository } from "./repository.base.ts";

export abstract class Service {
  protected readonly gateways: AppContext["gateways"];
  protected readonly config: AppContext["config"];
  protected readonly searchIndex: AppContext["searchIndex"];
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.gateways = ctx.gateways;
    this.config = ctx.config;
    this.searchIndex = ctx.searchIndex;
  }

  protected makeService<T extends Service>(Ctor: ServiceConstructor<T>): T {
    return new Ctor(this.ctx);
  }

  protected makeRepository<T extends Repository>(Ctor: RepositoryConstructor<T>): T {
    return new Ctor(this.ctx);
  }

  protected makeProjection<T extends Projection>(Ctor: ProjectionConstructor<T>): T {
    return new Ctor(this.ctx);
  }
}
