export type WorkspaceSummary = {
  readonly id: string;
  readonly kb: string;
  readonly worklogs: string;
  readonly indexDb: string;
  readonly match: readonly string[];
  readonly exclude: readonly string[];
  readonly noteCount: number | null;
};

export type KbMapResponse = {
  readonly vaultLabel: string;
  readonly features: readonly {
    readonly name: string;
    readonly hasIndexNote: boolean;
    readonly title: string;
    readonly description: string;
    readonly epic: string;
  }[];
  readonly looseNotes: readonly string[];
};

export type NoteListItem = {
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
};

export type NoteReadResponse = {
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
  readonly frontmatter: Record<string, string | readonly string[]>;
  readonly body: string;
  readonly rels: readonly { readonly relationType: string; readonly target: string }[];
  readonly mtimeMs: number;
};

export type GraphNode = {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly importance: number | null;
  readonly feature: string;
};

export type GraphEdge = {
  readonly src: string;
  readonly dst: string;
  readonly relType: string;
};

export type GraphResponse = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

export type SearchHit = {
  readonly path: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
};
