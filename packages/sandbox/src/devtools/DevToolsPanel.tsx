import { useCallback, useEffect, useState } from "react";
import { DevToolsList } from "./DevToolsList";
import type { ToolSchema } from "./index";

export type DevToolsProps = {
  url: string;
  agent: string;
};

const fabStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 16,
  right: 16,
  zIndex: 9999,
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0,0,0,0.75)",
  color: "#fff",
  fontSize: "1rem",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  transition: "transform 0.15s, box-shadow 0.15s",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const backdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
};

const dialogStyle: React.CSSProperties = {
  position: "relative",
  width: "min(1400px, 96vw)",
  height: "94vh",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 20px",
  borderBottom: "1px solid #e0e0e0",
  flexShrink: 0,
};

const closeButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "#666",
  fontSize: "1.1rem",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginLeft: "auto",
};

const searchInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: "0.85rem",
  border: "1px solid #ddd",
  borderRadius: 6,
  outline: "none",
  width: 220,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
};

const CodeBracketsIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

export function DevTools({ url, agent }: DevToolsProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [schemas, setSchemas] = useState<
    Record<string, ToolSchema> | undefined
  >(undefined);

  const close = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `${url}/api/agents/${agent}/schemas`;
    fetch(endpoint, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch schemas: ${res.status}`);
        return res.json();
      })
      .then((data) => setSchemas(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("DevTools: failed to fetch schemas", err);
      });
    return () => controller.abort();
  }, [url, agent]);

  return (
    <>
      {!open && (
        <button
          type="button"
          style={fabStyle}
          onClick={() => setOpen(true)}
          title="DevTools"
        >
          <CodeBracketsIcon />
        </button>
      )}

      {open && (
        <div style={overlayStyle}>
          <div style={backdropStyle} onClick={close} />
          <div style={dialogStyle}>
            <div style={headerStyle}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "1rem",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                DevTools
              </span>
              <input
                type="text"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={searchInputStyle}
                autoFocus
              />
              <button
                type="button"
                style={closeButtonStyle}
                onClick={close}
                title="Close (Esc)"
              >
                {"\u2715"}
              </button>
            </div>
            <div style={bodyStyle}>
              <DevToolsList schemas={schemas} searchQuery={searchQuery} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
