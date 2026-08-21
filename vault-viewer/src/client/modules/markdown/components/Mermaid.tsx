import { useMermaid } from "../hooks/useMermaid.js";

type MermaidProps = {
  code: string;
};

export function Mermaid({ code }: MermaidProps) {
  const { svg, error } = useMermaid(code);

  if (error) {
    return (
      <pre className="mermaid-error">
        {code}
        <span className="mermaid-error-msg">{error}</span>
      </pre>
    );
  }

  if (svg) {
    return (
      <div className="mermaid-container" dangerouslySetInnerHTML={{ __html: svg }} />
    );
  }

  return <pre className="mermaid-loading">{code}</pre>;
}
