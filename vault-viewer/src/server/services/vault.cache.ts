import type { FileSystem } from "../gateways/fs.gateway.js";
import type { VaultService } from "./vault.service.js";
import type { NoteFile } from "../../../server/vault.js";

type CacheEntry = {
  mtimeMs: number;
  notes: NoteFile[];
};

export class VaultCache {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly fs: FileSystem,
    private readonly vaultService: VaultService,
  ) {}

  private key(kbPath: string, exclude: string[]): string {
    return `${kbPath}::${exclude.join(",")}`;
  }

  async get(kbPath: string, exclude: string[]): Promise<NoteFile[]> {
    const k = this.key(kbPath, exclude);
    let mtimeMs = 0;
    try {
      const st = await this.fs.stat(kbPath);
      mtimeMs = st.mtimeMs;
    } catch {
      // if stat fails, bypass cache
      const notes = await this.vaultService.walkKb(kbPath, exclude);
      return notes;
    }

    const hit = this.cache.get(k);
    if (hit && hit.mtimeMs === mtimeMs) {
      return hit.notes;
    }

    const notes = await this.vaultService.walkKb(kbPath, exclude);
    this.cache.set(k, { mtimeMs, notes });
    return notes;
  }

  invalidate(kbPath: string, exclude: string[] = []): void {
    if (exclude.length === 0) {
      // invalidate all for kbPath
      for (const k of [...this.cache.keys()]) {
        if (k.startsWith(kbPath + "::")) this.cache.delete(k);
      }
    } else {
      this.cache.delete(this.key(kbPath, exclude));
    }
  }

  bustAll(): void {
    this.cache.clear();
  }
}
