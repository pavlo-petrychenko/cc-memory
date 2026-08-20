import type { Note } from "./vault.js";

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function scoreNote(note: Note, query: string, filters: {type?:string, tag?:string, feature?:string}): number {
  if (filters.type && note.type !== filters.type) return -1;
  if (filters.tag && !note.tags.split(" ").includes(filters.tag)) return -1;
  if (filters.feature) {
    const feat = note.relPath.split("/")[0] ?? "";
    if (feat !== filters.feature) return -1;
  }
  if (!query.trim()) return 0;
  const qTokens = tokenize(query);
  if (qTokens.length===0) return 0;
  const titleTokens = tokenize(note.title);
  const tagTokens = tokenize(note.tags);
  const bodyTokens = tokenize(note.body);
  let score = 0;
  for(const qt of qTokens){
    const inTitle = titleTokens.filter(t=>t.includes(qt) || qt.includes(t)).length;
    const inTags = tagTokens.filter(t=>t.includes(qt)).length;
    const inBody = bodyTokens.filter(t=>t===qt).length;
    // BM25 approx weights 10/5/1
    score += inTitle * 10 + inTags * 5 + inBody * 1;
    // bonus for exact title match
    if (note.title.toLowerCase().includes(query.toLowerCase())) score += 5;
  }
  // boost importance slightly
  if (note.importance) score += note.importance * 0.1;
  return score;
}

export function searchNotes(notes: Note[], query: string, filters: {type?:string, tag?:string, feature?:string}, limit=20){
  const scored = notes.map(n=>({note:n, score: scoreNote(n, query, filters)}))
    .filter(x=>x.score>=0)
    .filter(x=> query.trim() ? x.score>0 : true)
    .sort((a,b)=>b.score-a.score)
    .slice(0, limit);
  return scored.map(({note, score})=>{
    // snippet: first 200 chars around first query hit
    let snippet = note.body.slice(0,200).replace(/\s+/g," ").trim();
    if(query.trim()){
      const idx = note.body.toLowerCase().indexOf(query.toLowerCase().split(" ")[0] ?? "");
      if(idx!==-1){
        const start = Math.max(0, idx-60);
        snippet = (start>0?"…":"") + note.body.slice(start, start+180).replace(/\s+/g," ").trim() + "…";
      }
    }
    return { path: note.relPath, title: note.title, type: note.type, tags: note.tags, snippet, score };
  });
}
