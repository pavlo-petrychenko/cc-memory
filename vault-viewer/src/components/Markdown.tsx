import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fileUrl } from "../services/api";

function preprocess(text: string, workspace: string, currentPath: string): string {
  // Convert wikilinks [[Target|Alias]] and [[Target]] to markdown links with custom scheme wikilink://
  let out = text.replace(/!\[\[([^\]]+)\]\]/g, (_m, targetRaw) => {
    const t = String(targetRaw).split("|")[0]!.trim();
    // embeds will be handled as custom component via image-like? For now convert to blockquote embed
    return `\n> [!EMBED] ${t}\n`;
  });
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, target, alias) => {
    const t = String(target).trim();
    const a = String(alias).trim();
    return `[${a}](wikilink://${encodeURIComponent(t)})`;
  });
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, targetRaw) => {
    const t = String(targetRaw).trim();
    return `[${t}](wikilink://${encodeURIComponent(t)})`;
  });
  // inline tags #tag -> keep as text but style via remark? We'll leave as is
  return out;
}

export function Markdown({ body, workspace, currentPath, onWikilink }: { body: string; workspace: string; currentPath: string; onWikilink?: (target:string, newTab:boolean)=>void }) {
  const processed = useMemo(()=> preprocess(body, workspace, currentPath), [body, workspace, currentPath]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a(props) {
          const href = String(props.href ?? "");
          if (href.startsWith("wikilink://")) {
            const target = decodeURIComponent(href.replace("wikilink://",""));
            return (
              <a
                href="#"
                onClick={(e)=>{
                  e.preventDefault();
                  onWikilink?.(target, (e as React.MouseEvent).metaKey || (e as React.MouseEvent).ctrlKey);
                }}
                style={{ color:"var(--accent)", borderBottom:"1px dashed var(--accent)", textDecoration:"none" }}
              >
                {props.children}
              </a>
            );
          }
          return <a {...props} />;
        },
        img(props) {
          // resolve relative to current note dir or vault root
          let src = String(props.src ?? "");
          if (!src.startsWith("http") && !src.startsWith("/api")) {
            // if src is ./assets/diagram.png relative to note dir
            const dir = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
            const rel = src.startsWith("./") ? src.slice(2) : src;
            const full = dir ? `${dir}/${rel}` : rel;
            // try vault-relative first, then dir-relative
            src = fileUrl(workspace, full);
          }
          return <img {...props} src={src} style={{ maxWidth:"100%", border:"1px solid var(--border)", borderRadius:6, boxShadow:"0 2px 8px rgba(0,0,0,.2)" }} />;
        },
        blockquote(props) {
          // detect callouts > [!NOTE]
          const text = String((props.children as any)?.[0]?.props?.children ?? "");
          // Simple: if first child text starts with [!NOTE] we style
          // ReactMarkdown splits, so check raw
          return <blockquote {...props} style={{ borderLeft:"2px solid var(--accent)", background:"var(--panel)", margin:"12px 0", padding:"10px 12px", borderRadius:4 }}>{props.children}</blockquote>;
        },
        code(props) {
          const { children, className } = props as any;
          const isInline = !className;
          if (isInline) return <code style={{ background:"var(--panel2)", border:"1px solid var(--border)", padding:"0 4px", borderRadius:4, fontSize:"12px" }}>{children}</code>;
          // detect mermaid
          const lang = String(className ?? "").replace("language-","");
          const codeText = String(children).trim();
          if (lang==="mermaid") {
            return <Mermaid code={codeText} />;
          }
          return <pre style={{ background:"var(--panel)", border:"1px solid var(--border)", borderLeft:"2px solid var(--accent)", borderRadius:6, padding:"12px 14px", overflow:"auto", fontSize:"12px", lineHeight:1.6 }}><code>{children}</code></pre>;
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function Mermaid({ code }: { code: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState<string>("");
  React.useEffect(()=>{
    let cancelled=false;
    import("mermaid").then(m=>{
      m.default.initialize({ startOnLoad:false, theme: document.documentElement.getAttribute("data-theme")==="light" ? "default":"dark" });
      const id = "mmd-" + Math.random().toString(36).slice(2);
      m.default.render(id, code).then(r=>{
        if (!cancelled) setSvg(r.svg);
      }).catch(()=> setSvg(`<pre style="color:var(--muted)">${code}</pre>`));
    });
    return ()=> { cancelled=true; };
  }, [code]);
  if (svg) return <div ref={ref} dangerouslySetInnerHTML={{__html: svg}} style={{ background:"var(--panel)", border:"1px solid var(--border)", borderRadius:6, padding:12, overflow:"auto" }} />;
  return <pre style={{ background:"var(--panel)", border:"1px solid var(--border)", padding:12, borderRadius:6, fontSize:12, color:"var(--muted)" }}>{code}</pre>;
}
