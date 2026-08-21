import type { ChangeEvent } from "react";

type Props = {
  q: string;
  setQ: (v: string) => void;
  onFocus?: () => void;
  placeholder?: string;
};

export function SearchBar({ q, setQ, onFocus, placeholder = "Search  titles, tags, body…  (⌘K)" }: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setQ(e.target.value);
  };

  return (
    <div
      style={{
        flex: 1,
        maxWidth: 480,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "5px 10px",
        color: "var(--muted)",
      }}
    >
      <span style={{ opacity: 0.6 }}>⌕</span>
      <input
        value={q}
        onChange={handleChange}
        onFocus={onFocus}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: "transparent",
          border: 0,
          outline: "none",
          color: "var(--text)",
          fontSize: 12,
          fontFamily: "Fragment Mono",
        }}
      />
      <kbd
        style={{
          background: "var(--panel2)",
          border: "1px solid var(--border)",
          padding: "1px 5px",
          borderRadius: 3,
          fontSize: 10,
        }}
      >
        ⌘K
      </kbd>
    </div>
  );
}
