export type Workspace = {
  id: string;
  kb: string;
  tildifiedKb: string;
  noteCount: number;
  indexFresh: string;
};

export type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
  isIndex?: boolean;
};

export type WorklogSlug = {
  slug: string;
  stateExists: boolean;
  stateBody?: string;
  entries: { date: string; body: string; relPath: string }[];
};

export type Note = {
  relPath: string;
  title: string;
  type: string;
  importance: number | null;
  tags: string;
  epic: string;
  body: string;
  rels: { relationType: string; target: string }[];
  backlinks: { relPath: string; title: string; snippet: string }[];
  outgoing: { relationType: string; target: string }[];
  isWorklog: boolean;
};

export type SearchHit = {
  relPath: string;
  title: string;
  type: string;
  importance: number | null;
  tags: string;
  snippet: string;
  score: number;
};

export type Graph = {
  nodes: { id: string; title: string; type: string; importance: number | null; tags: string }[];
  edges: { source: string; target: string; relationType: string }[];
};

export type Tab = { relPath: string; title: string };
