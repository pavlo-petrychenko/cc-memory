# Phase 1: Base Classes + AppContext DI

## Dependencies

- None (starting point)

## Can Parallel With

- None (must complete first)

## Objective

Add the DI base classes and `AppContext` type. This phase is **additive** — no
existing file changes behavior, nothing imports the new code yet. One quality-gate
migration is required so the new `.base.ts` filenames pass `fileKinds.test.ts`.

## Files to Create

### 1. `src/core/base/context.typedefs.ts`

Corrected import paths (config is `@/core/config/`, not `@/core/domain/config/`):

```typescript
import type { Config } from "@/core/config/config.typedefs.ts";
import type { Gateways } from "@/gateways/gateways.typedefs.ts";

export interface AppContext {
  gateways: Gateways;
  config: Config;
}
```

Note: `@/gateways/gateways.typedefs.ts` is a cross-module import but ends in a
`.typedefs.ts` suffix, which `moduleBoundaries.test.ts` treats as a declaration
import — allowed. Do not add a `core/base/index.ts` (nested barrels are forbidden).

### 2. `src/core/base/constructor.typedefs.ts`

```typescript
import type { AppContext } from "./context.typedefs.ts";

export interface UseCaseConstructor<Options, Result> {
  new (ctx: AppContext): { execute(options: Options): Promise<Result> };
}
export interface ServiceConstructor<T> {
  new (ctx: AppContext): T;
}
export interface RepositoryConstructor<T> {
  new (ctx: AppContext): T;
}
export interface ProjectionConstructor<T> {
  new (ctx: AppContext): T;
}
export interface FormatterConstructor<T> {
  new (): { format(input: T): string | null };
}
```

### 3. `src/core/base/useCase.base.ts`

```typescript
import type { AppContext } from "./context.typedefs.ts";
import type {
  ProjectionConstructor,
  RepositoryConstructor,
  ServiceConstructor,
} from "./constructor.typedefs.ts";
import type { Projection } from "./projection.base.ts";
import type { Repository } from "./repository.base.ts";
import type { Service } from "./service.base.ts";

export abstract class UseCase<Options, Result> {
  protected readonly gateways: AppContext["gateways"];
  protected readonly config: AppContext["config"];

  constructor(ctx: AppContext) {
    this.gateways = ctx.gateways;
    this.config = ctx.config;
  }

  protected makeService<T extends Service>(Ctor: ServiceConstructor<T>): T {
    return new Ctor({ gateways: this.gateways, config: this.config });
  }
  protected makeRepository<T extends Repository>(Ctor: RepositoryConstructor<T>): T {
    return new Ctor({ gateways: this.gateways, config: this.config });
  }
  protected makeProjection<T extends Projection>(Ctor: ProjectionConstructor<T>): T {
    return new Ctor({ gateways: this.gateways, config: this.config });
  }

  abstract execute(options: Options): Promise<Result>;
}
```

### 4. `src/core/base/service.base.ts`

```typescript
import type { AppContext } from "./context.typedefs.ts";
import type { ProjectionConstructor, RepositoryConstructor } from "./constructor.typedefs.ts";
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
```

### 5. `src/core/base/repository.base.ts`

```typescript
import type { AppContext } from "./context.typedefs.ts";

export abstract class Repository {
  protected readonly gateways: AppContext["gateways"];
  protected readonly config: AppContext["config"];

  constructor(ctx: AppContext) {
    this.gateways = ctx.gateways;
    this.config = ctx.config;
  }
}
```

### 6. `src/core/base/projection.base.ts`

Identical shape to `repository.base.ts` (holds `gateways`/`config`), named
`Projection`.

### 7. Re-export through `src/core/index.ts` (no `core/base/index.ts`)

Add to `src/core/index.ts`:

```typescript
export { UseCase } from "@/core/base/useCase.base.ts";
export { Service } from "@/core/base/service.base.ts";
export { Repository } from "@/core/base/repository.base.ts";
export { Projection } from "@/core/base/projection.base.ts";
export type { AppContext } from "@/core/base/context.typedefs.ts";
export type {
  FormatterConstructor,
  ProjectionConstructor,
  RepositoryConstructor,
  ServiceConstructor,
  UseCaseConstructor,
} from "@/core/base/constructor.typedefs.ts";
```

## Required quality-gate migration

`src/quality/fileKinds.test.ts` — add `.base.ts` to `ALLOWED_SUFFIXES`. This is a
deliberate one-line change: the suffix scheme now includes base classes.

## Implementation Steps

1. Create `src/core/base/` with the 6 files above.
2. Re-export them from `src/core/index.ts`.
3. Add `.base.ts` to `fileKinds.test.ts` `ALLOWED_SUFFIXES`.
4. No other imports change (nothing consumes the new code yet).

## Tests

`src/core/base/useCase.base.test.ts` — a `TestService extends Service` with a
value, and a `TestUseCase extends UseCase<{ input: string }, number>` that calls
`this.makeService(TestService)`; assert `42 + input.length`. Also assert
`gateways`/`config` are reachable as `this.gateways`/`this.config`.

## Acceptance Criteria

- [ ] 6 base files + `core/index.ts` re-exports
- [ ] `.base.ts` in `fileKinds.test.ts` `ALLOWED_SUFFIXES`
- [ ] No `core/base/index.ts` (nested barrels forbidden)
- [ ] `bun test src/core/base/` passes
- [ ] `bun run check` passes from a clean `dist/`

## Next Phase

→ Phase 2 (CLI transport) and Phase 3 (Hook transport) run in parallel.
