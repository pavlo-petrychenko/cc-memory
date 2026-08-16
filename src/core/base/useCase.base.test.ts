import { describe, expect, test } from "bun:test";

import type { Config } from "@/core/config/config.typedefs.ts";
import { LogLevel } from "@/core/config/config.typedefs.ts";

import type { AppContext } from "./context.typedefs.ts";
import { Projection } from "./projection.base.ts";
import { Repository } from "./repository.base.ts";
import { Service } from "./service.base.ts";
import { UseCase } from "./useCase.base.ts";

const CONFIG: Config = {
  injectMinScore: 0.2,
  linkBoost: 0.003,
  injectLogEnabled: true,
  blockAfter: 2,
  blockDrift: 5,
  gateDisabled: false,
  logLevel: LogLevel.Warn,
};

// SAFETY: the base classes under test only store the gateways reference and pass
// it through `make*` — they never dereference a member, so an empty object stands in.
const CTX: AppContext = { gateways: {} as AppContext["gateways"], config: CONFIG };

class TestRepository extends Repository {
  kind(): string {
    return "repository";
  }
}

class TestProjection extends Projection {
  kind(): string {
    return "projection";
  }
}

class TestService extends Service {
  private readonly repository = this.makeRepository(TestRepository);
  private readonly projection = this.makeProjection(TestProjection);

  kinds(): string {
    return `${this.repository.kind()}+${this.projection.kind()}`;
  }
}

class TestUseCase extends UseCase<{ input: string }, number> {
  private readonly service = this.makeService(TestService);

  async execute(options: { input: string }): Promise<number> {
    return this.service.kinds().length + options.input.length;
  }
}

describe("core/base DI", () => {
  test("UseCase composes a Service via makeService", async () => {
    const useCase = new TestUseCase(CTX);
    expect(await useCase.execute({ input: "test" })).toBe(25);
  });

  test("Service composes Repository and Projection via make*", () => {
    const service = new TestService(CTX);
    expect(service.kinds()).toBe("repository+projection");
  });
});
