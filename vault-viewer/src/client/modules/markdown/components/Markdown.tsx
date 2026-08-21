import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fileUrl } from "../../../services/api/client.js";
import { Callout } from "./Callout.js";
import { EmbedBlock } from "./EmbedBlock.js";
import { Mermaid } from "./Mermaid.js";

type MarkdownProps = {
  body: string;
  workspace: string;
  currentPath: string;
  onWikilink?: (target: string, newTab: boolean) => void;
  knownTargets?: ReadonlySet<string>;
};

export function preprocessMarkdown(text: string): string {
  let out = text.replace(/!\[\[([^\]]+)\]\]/g, (_m: string, targetRaw: string) => {
    const t = String(targetRaw).split("|")[0]?.trim() ?? "";
    return `\n> [!EMBED] ${t}\n`;
  });
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m: string, target: string, alias: string) => {
    const t = String(target).trim();
    const a = String(alias).trim();
    return `[${a}](wikilink://${encodeURIComponent(t)})`;
  });
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m: string, targetRaw: string) => {
    const t = String(targetRaw).trim();
    return `[${t}](wikilink://${encodeURIComponent(t)})`;
  });
  return out;
}

export function Markdown({ body, workspace, currentPath, onWikilink, knownTargets }: MarkdownProps) {
  const processed = useMemo(() => preprocessMarkdown(body), [body]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url: string) => url}
      components={{
        a(props) {
          const href = String(props.href ?? "");
          if (href.startsWith("wikilink://")) {
            const target = decodeURIComponent(href.replace("wikilink://", ""));
            const key = target.toLowerCase();
            const isKnown =
              !knownTargets || knownTargets.has(key) || knownTargets.has(`${key}.md`);
            return (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  const newTab = (e as React.MouseEvent).metaKey || (e as React.MouseEvent).ctrlKey;
                  onWikilink?.(target, newTab);
                }}
                className={isKnown ? "wikilink wikilink-known" : "wikilink wikilink-unknown"}
                title={isKnown ? target : `${target} — unresolved`}
              >
                {props.children}
              </a>
            );
          }
          return <a {...props} />;
        },
        img(props) {
          let src = String(props.src ?? "");
          if (!src.startsWith("http") && !src.startsWith("/api")) {
            const dir = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
            const rel = src.startsWith("./") ? src.slice(2) : src;
            const full = dir ? `${dir}/${rel}` : rel;
            src = fileUrl(workspace, full);
          }
          return <img {...props} src={src} className="md-img" />;
        },
        blockquote(props) {
          const inner = (props.children as unknown as { props?: { children?: unknown } }[] | undefined)?.[0];
          const raw = String((inner as { props?: { children?: unknown } } | string | undefined) && typeof inner === "object" && inner !== null && "props" in inner ? (inner as { props?: { children?: unknown } }).props?.children ?? "" : "").trim();

          // Fallback: stringify children for simple cases
          const altRaw =
            raw ||
            (() => {
              const c = props.children as unknown;
              if (typeof c === "string") return c;
              if (Array.isArray(c)) return String(c[0] ?? "");
              return "";
            })().trim();

          if (altRaw.startsWith("[!EMBED]")) {
            const target = altRaw.replace("[!EMBED]", "").trim();
            return <EmbedBlock target={target} onWikilink={(t) => onWikilink?.(t, false)} />;
          }
          if (altRaw.startsWith("[!")) {
            const isWarn = altRaw.includes("WARNING");
            return <Callout type={isWarn ? "WARNING" : "NOTE"}>{props.children}</Callout>;
          }
          return <blockquote className="md-blockquote">{props.children}</blockquote>;
        },
        code(props) {
          const { children, className } = props as { children?: unknown; className?: string };
          const isInline = !className;
          if (isInline) return <code className="md-code-inline">{children as string}</code>;
          const lang = String(className ?? "").replace("language-", "");
          const codeText = String(children).trim();
          if (lang === "mermaid") {
            return <Mermaid code={codeText} />;
          }
          return (
            <pre className="md-code-block">
              <code>{children as string}</code>
            </pre>
          );
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}
