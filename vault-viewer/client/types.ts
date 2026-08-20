export type Workspace = { id:string; kb:string; kbTildified:string; worklogs:string; worklogsTildified:string; noteCount:number; indexFresh:string|null };
export type TreeNode = { name:string; path:string; type:"file"|"dir"; children?: TreeNode[]; title?: string };
export type NoteDetail = {
  path:string; title:string; type:string; importance:number|null; tags:string; epic:string; body:string;
  rels:{relationType:string,target:string}[];
  outgoing:{relationType:string,target:string}[];
  backlinks:{path:string,title:string,snippet:string}[];
  headings:{level:number,text:string,slug:string}[];
  frontmatter: Record<string,string|string[]>;
};
export type SearchHit = { path:string; title:string; type:string; tags:string; snippet:string; score:number };
export type Graph = { nodes:{id:string,title:string,type:string,importance:number|null,tags:string}[]; edges:{source:string,target:string,relationType:string}[]; mode:string; focus?:string };
export type Worklog = { slug:string; state:string|null; entries:{date:string,body:string}[]; slugs:string[] };
