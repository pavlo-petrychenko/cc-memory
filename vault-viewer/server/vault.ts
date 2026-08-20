import fs from "fs";
import path from "path";
import { parseNote } from "./parser.js";

export type NoteFile = { absPath: string; relPath: string; mtimeMs: number };
export type Note = ReturnType<typeof parseNote> & { absPath: string; relPath: string; mtimeMs: number };

function isExcludedDir(relDir: string, exclude: string[]): boolean {
  if (relDir.split("/").some(s => s.startsWith("."))) return true;
  for (const e of exclude) {
    const t = e.replace(/^\/+|\/+$/g, "");
    if (relDir === t || relDir.startsWith(t + "/")) return true;
  }
  return false;
}

export async function scanNotes(kb: string, exclude: string[]): Promise<NoteFile[]> {
  if (!fs.existsSync(kb)) return [];
  const out: NoteFile[] = [];
  async function walk(dir: string, relDir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name));
    for (const ent of entries) {
      const childRel = relDir ? `${relDir}/${ent.name}` : ent.name;
      const childAbs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (isExcludedDir(childRel, exclude)) continue;
        await walk(childAbs, childRel);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        // skip daily journals at root? but we keep loose notes filter later
        const stat = fs.statSync(childAbs);
        out.push({ absPath: childAbs, relPath: childRel, mtimeMs: stat.mtimeMs });
      }
    }
  }
  await walk(kb, "");
  return out;
}

export function readNoteFile(f: NoteFile): Note | null {
  try {
    const text = fs.readFileSync(f.absPath, "utf-8");
    const base = path.basename(f.absPath);
    const fallback = base.endsWith(".md") ? base.slice(0, -3) : base;
    const parsed = parseNote(text, fallback);
    return { ...parsed, absPath: f.absPath, relPath: f.relPath, mtimeMs: f.mtimeMs };
  } catch { return null; }
}

export function loadAllNotes(kb: string, exclude: string[]): Note[] {
  const files = fs.existsSync(kb) ? (() => {
    const out: NoteFile[] = [];
    function walk(dir:string, relDir:string){
      const entries = fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
      for(const ent of entries){
        const childRel = relDir ? `${relDir}/${ent.name}` : ent.name;
        const childAbs = path.join(dir, ent.name);
        if(ent.isDirectory()){
          if(isExcludedDir(childRel, exclude)) continue;
          walk(childAbs, childRel);
        } else if(ent.isFile() && ent.name.endsWith(".md")){
          const stat = fs.statSync(childAbs);
          out.push({absPath: childAbs, relPath: childRel, mtimeMs: stat.mtimeMs});
        }
      }
    }
    walk(kb,"");
    return out;
  })() : [];
  const notes: Note[] = [];
  for(const f of files){
    const n = readNoteFile(f);
    if(n) notes.push(n);
  }
  return notes;
}

export type TreeNode = { name: string; path: string; type: "file" | "dir"; children?: TreeNode[]; title?: string };

export function buildKbTree(notes: Note[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  for (const n of notes) {
    // filter out worklog journals at top? we keep all, but loose detection is for display
    const parts = n.relPath.split("/");
    let cur = root;
    for (let i=0;i<parts.length;i++) {
      const part = parts[i]!;
      const isFile = i === parts.length-1;
      const curPath = parts.slice(0,i+1).join("/");
      let child = cur.children!.find(c=>c.name===part);
      if(!child){
        child = { name: part, path: curPath, type: isFile ? "file" : "dir", children: isFile ? undefined : [] };
        if(isFile) child.title = n.title;
        cur.children!.push(child);
      }
      if(!isFile) cur = child;
    }
  }
  // sort dirs first then files alphabetically
  function sort(n: TreeNode){
    if(n.children){
      n.children.sort((a,b)=>{
        if(a.type!==b.type) return a.type==="dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sort);
    }
  }
  sort(root);
  return root.children ?? [];
}

export type WorklogSlug = { slug: string; stateExists: boolean; dates: string[]; stateBody?: string };

export function scanWorklogs(worklogsRoot: string): WorklogSlug[] {
  if (!fs.existsSync(worklogsRoot)) return [];
  const entries = fs.readdirSync(worklogsRoot, {withFileTypes:true}).filter(e=>e.isDirectory() && !e.name.startsWith(".")).sort((a,b)=>a.name.localeCompare(b.name));
  const out: WorklogSlug[] = [];
  for(const e of entries){
    const slugDir = path.join(worklogsRoot, e.name);
    const files = fs.readdirSync(slugDir).filter(f=>f.endsWith(".md")).sort();
    const dates = files.filter(f=>/^\d{4}-\d{2}-\d{2}\.md$/.test(f)).map(f=>f.slice(0,-3));
    const stateExists = files.includes("STATE.md");
    let stateBody: string | undefined;
    if(stateExists){
      try{ stateBody = fs.readFileSync(path.join(slugDir,"STATE.md"),"utf-8"); }catch{}
    }
    out.push({ slug: e.name, stateExists, dates, stateBody });
  }
  // also check if STATE.md at _root style is direct file? fallback: if root has loose STATE.md treat as _root
  if(out.length===0){
    const direct = path.join(worklogsRoot, "STATE.md");
    if(fs.existsSync(direct)){
      out.push({ slug:"_root", stateExists:true, dates:[], stateBody: fs.readFileSync(direct,"utf-8")});
    }
  }
  return out;
}

export function readWorklogEntries(worklogsRoot:string, slug:string): { state: string | null, entries: {date:string, body:string}[] }{
  const dir = path.join(worklogsRoot, slug);
  if(!fs.existsSync(dir)) return { state:null, entries:[] };
  let state: string | null = null;
  try{ state = fs.readFileSync(path.join(dir,"STATE.md"),"utf-8"); }catch{}
  const files = fs.readdirSync(dir).filter(f=>/^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
  const entries = files.map(f=>{
    const date = f.slice(0,-3);
    const body = fs.readFileSync(path.join(dir,f),"utf-8");
    return { date, body };
  });
  return { state, entries };
}
