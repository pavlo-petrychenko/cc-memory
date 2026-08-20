export type WorkspaceConfig = {
  id: string;
  kb: string;
  worklogs: string;
  exclude: string[];
  indexDb: string;
  match: string[];
};

export type ResolvedWorkspace = WorkspaceConfig & {
  kbAbs: string;
  worklogsAbs: string;
};

export type NoteMeta = {
  path: string;
  title: string;
  type: string;
  importance: number | null;
  tags: string[];
  epic: string | null;
  rels: { relationType: string; target: string }[];
  backlinks?: string[];
};

export type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  isIndex?: boolean;
  children?: TreeNode[];
};

export type WorklogEntry = { date: string; body: string; path: string };
export type WorklogSlug = { slug: string; statePath: string | null; entries: WorklogEntry[] };
