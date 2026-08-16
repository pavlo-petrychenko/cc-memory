import type { Workspace } from "@/core/domain.typedefs.ts";
import type { Hit } from "@/core/search/search.typedefs.ts";
import type {
  Collection,
  IndexDocument,
  InlinkCounts,
  SearchIndex,
} from "@/gateways/searchIndex/searchIndex.typedefs.ts";

/** An in-memory `SearchIndex` for tests — deterministic, configurable, and free of
 * any SQLite. It records projections and returns the hits/inlinks a test staged
 * beforehand; the real BM25 semantics live in `SearchIndexAdapter`, which is tested
 * against a real `bun:sqlite` database. */
export class SearchIndexFake implements SearchIndex {
  private resetResult = false;
  private nextHits: readonly Hit[] = [];
  private nextInlinks: InlinkCounts = new Map();
  private nextExisting: ReadonlyMap<string, number> = new Map();

  readonly projected: {
    readonly collection: Collection;
    readonly documents: readonly IndexDocument[];
  }[] = [];

  setResetResult(value: boolean): void {
    this.resetResult = value;
  }

  setNextHits(hits: readonly Hit[]): void {
    this.nextHits = hits;
  }

  setNextInlinks(inlinks: InlinkCounts): void {
    this.nextInlinks = inlinks;
  }

  setNextExisting(existing: ReadonlyMap<string, number>): void {
    this.nextExisting = existing;
  }

  async resetIfStale(_workspace: Workspace): Promise<boolean> {
    return this.resetResult;
  }

  async project(
    _workspace: Workspace,
    collection: Collection,
    documents: readonly IndexDocument[],
  ): Promise<void> {
    this.projected.push({ collection, documents });
  }

  async listExisting(
    _workspace: Workspace,
    _collection: Collection,
  ): Promise<ReadonlyMap<string, number>> {
    return this.nextExisting;
  }

  async prune(
    _workspace: Workspace,
    _collection: Collection,
    _keepPaths: ReadonlySet<string>,
  ): Promise<void> {}

  async query(
    _workspace: Workspace,
    _collection: Collection,
    _expression: string,
    _weights: readonly number[],
    _limit: number,
  ): Promise<readonly Hit[]> {
    return this.nextHits;
  }

  async neighbors(
    _workspace: Workspace,
    _paths: readonly string[],
  ): Promise<InlinkCounts> {
    return this.nextInlinks;
  }
}
