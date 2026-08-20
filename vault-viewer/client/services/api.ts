export async function fetchWorkspaces(){
  const r = await fetch("/api/workspaces");
  if(!r.ok) throw new Error("workspaces failed");
  return r.json();
}
export async function fetchTree(workspace:string){
  const r = await fetch(`/api/tree?workspace=${encodeURIComponent(workspace)}`);
  if(!r.ok) throw new Error("tree failed");
  return r.json() as Promise<{workspace:string,kb:string,kbTree:any,worklogs:any,noteCount:number}>;
}
export async function fetchNote(workspace:string, path:string){
  const r = await fetch(`/api/note?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`);
  if(!r.ok) throw new Error("note failed");
  return r.json();
}
export async function fetchSearch(workspace:string, q:string, filters:Record<string,string>={}){
  const u = new URL("/api/search", location.origin);
  u.searchParams.set("workspace", workspace);
  u.searchParams.set("q", q);
  for(const [k,v] of Object.entries(filters)) if(v) u.searchParams.set(k,v);
  const r = await fetch(u);
  if(!r.ok) throw new Error("search failed");
  return r.json() as Promise<{query:string,hits:any[]}>;
}
export async function fetchGraph(workspace:string, focus?:string, depth=1, full=false){
  const u = new URL("/api/graph", location.origin);
  u.searchParams.set("workspace", workspace);
  if(focus) u.searchParams.set("focus", focus);
  u.searchParams.set("depth", String(depth));
  u.searchParams.set("full", full?"1":"0");
  const r = await fetch(u);
  if(!r.ok) throw new Error("graph failed");
  return r.json();
}
export async function fetchWorklog(workspace:string, slug:string){
  const r = await fetch(`/api/worklog?workspace=${encodeURIComponent(workspace)}&slug=${encodeURIComponent(slug)}`);
  if(!r.ok) throw new Error("worklog failed");
  return r.json();
}
export async function postReindex(workspace:string){
  const r = await fetch(`/api/reindex?workspace=${encodeURIComponent(workspace)}`,{method:"POST"});
  if(!r.ok) throw new Error("reindex failed");
  return r.json();
}
