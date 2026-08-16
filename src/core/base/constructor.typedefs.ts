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
