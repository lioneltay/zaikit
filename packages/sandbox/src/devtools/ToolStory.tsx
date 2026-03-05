import type {
  ToolRenderFn,
  ToolRenderProps,
  ToolRenderState,
} from "@zaikit/react";
import { useCallback, useMemo, useState } from "react";
import { buildDefaultValues } from "../schema-utils";
import type { ToolSchema } from "./index";
import { SchemaField } from "./SchemaField";

type ToolStoryProps = {
  name: string;
  render: ToolRenderFn;
  schema?: ToolSchema;
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  marginBottom: 16,
  overflow: "hidden",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  background: "#fafafa",
};

const bodyStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "300px 1fr",
  minHeight: 120,
};

const controlsStyle: React.CSSProperties = {
  padding: 16,
  borderRight: "1px solid #f0f0f0",
  overflowY: "auto",
  maxHeight: 400,
};

const previewPaneStyle: React.CSSProperties = {
  padding: 16,
  overflowY: "auto",
  maxHeight: 400,
};

const stateButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px",
  fontSize: "0.75rem",
  border: active ? "1px solid #1976d2" : "1px solid #ddd",
  borderRadius: 4,
  cursor: "pointer",
  background: active ? "#1976d2" : "#fff",
  color: active ? "#fff" : "#555",
  marginRight: 4,
  fontWeight: active ? 600 : 400,
});

const disabledButtonStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: "0.75rem",
  border: "1px solid #eee",
  borderRadius: 4,
  cursor: "not-allowed",
  background: "#f8f8f8",
  color: "#ccc",
  marginRight: 4,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#999",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 6,
  marginTop: 14,
};

const preStyle: React.CSSProperties = {
  background: "#f5f5f5",
  padding: 8,
  borderRadius: 4,
  fontSize: "0.8rem",
  fontFamily: "monospace",
  overflow: "auto",
  maxHeight: 160,
  whiteSpace: "pre-wrap",
  margin: 0,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "0.8rem",
  fontFamily: "monospace",
  border: "1px solid #ddd",
  borderRadius: 4,
  boxSizing: "border-box",
  minHeight: 48,
  resize: "vertical",
};

function JsonEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      try {
        onChange(JSON.parse(e.target.value));
      } catch {
        // Keep raw text while user is typing invalid JSON
      }
    },
    [onChange],
  );

  return (
    <div>
      <div style={{ ...sectionLabelStyle, marginTop: 0 }}>{label}</div>
      <textarea style={textareaStyle} value={text} onChange={handleChange} />
    </div>
  );
}

export function ToolStory({ name, render, schema }: ToolStoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<ToolRenderState>("call");
  const hasSuspend = !!schema?.suspend;

  const [args, setArgs] = useState<unknown>(() =>
    schema?.input ? buildDefaultValues(schema.input) : {},
  );
  const [suspendPayload, setSuspendPayload] = useState<unknown>(() =>
    schema?.suspend ? buildDefaultValues(schema.suspend) : {},
  );
  const [resultText, setResultText] = useState("null");
  const [errorText, setErrorText] = useState("Something went wrong");
  const [capturedResume, setCapturedResume] = useState<unknown>(undefined);

  const result = useMemo(() => {
    try {
      return JSON.parse(resultText);
    } catch {
      return resultText;
    }
  }, [resultText]);

  // Stable key that changes when mock inputs change — forces renderers that
  // use useState(props.arg) to remount with fresh initial values.
  const previewKey = useMemo(
    () =>
      JSON.stringify({
        args,
        state,
        suspendPayload: state === "suspended" ? suspendPayload : undefined,
        result: state === "result" ? result : undefined,
        error: state === "error" ? errorText : undefined,
      }),
    [args, state, suspendPayload, result, errorText],
  );

  const mockProps: ToolRenderProps = useMemo(
    () => ({
      toolCallId: `catalogue-${name}`,
      toolName: name,
      state,
      args: (args ?? {}) as Record<string, unknown>,
      suspendPayload: state === "suspended" ? suspendPayload : undefined,
      result: state === "result" ? result : undefined,
      error: state === "error" ? errorText : undefined,
      resume: (data: unknown) => {
        setCapturedResume(data);
      },
    }),
    [name, state, args, suspendPayload, result, errorText],
  );

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div
        style={{
          ...cardHeaderStyle,
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #e0e0e0" : "none",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          style={{
            fontSize: "0.75rem",
            color: "#999",
            width: 12,
            flexShrink: 0,
          }}
        >
          {expanded ? "\u25BE" : "\u25B8"}
        </span>
        <strong style={{ fontSize: "0.9rem" }}>{name}</strong>
        {schema?.description && (
          <span style={{ fontSize: "0.75rem", color: "#888" }}>
            — {schema.description}
          </span>
        )}
        <div
          style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            style={stateButtonStyle(state === "call")}
            onClick={() => setState("call")}
          >
            call
          </button>
          {hasSuspend ? (
            <button
              type="button"
              style={stateButtonStyle(state === "suspended")}
              onClick={() => setState("suspended")}
            >
              suspended
            </button>
          ) : (
            <button type="button" style={disabledButtonStyle} disabled>
              suspended
            </button>
          )}
          <button
            type="button"
            style={stateButtonStyle(state === "result")}
            onClick={() => setState("result")}
          >
            result
          </button>
          <button
            type="button"
            style={stateButtonStyle(state === "error")}
            onClick={() => setState("error")}
          >
            error
          </button>
        </div>
      </div>

      {/* Body: controls | preview */}
      {expanded && (
        <div style={bodyStyle}>
          <div style={controlsStyle}>
            {/* Args — always shown. Schema form when available, JSON editor otherwise. */}
            {schema?.input ? (
              <div>
                <div style={{ ...sectionLabelStyle, marginTop: 0 }}>Args</div>
                <SchemaField
                  name="args"
                  schema={schema.input}
                  value={args}
                  onChange={setArgs}
                />
              </div>
            ) : (
              <JsonEditor label="Args (JSON)" value={args} onChange={setArgs} />
            )}

            {/* Suspend payload — shown in suspended state */}
            {state === "suspended" &&
              (schema?.suspend ? (
                <div>
                  <div style={sectionLabelStyle}>Suspend Payload</div>
                  <SchemaField
                    name="suspend"
                    schema={schema.suspend}
                    value={suspendPayload}
                    onChange={setSuspendPayload}
                  />
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <JsonEditor
                    label="Suspend Payload (JSON)"
                    value={suspendPayload}
                    onChange={setSuspendPayload}
                  />
                </div>
              ))}

            {/* Result — shown in result state */}
            {state === "result" && (
              <div>
                <div style={sectionLabelStyle}>Result (JSON)</div>
                <textarea
                  style={textareaStyle}
                  value={resultText}
                  onChange={(e) => setResultText(e.target.value)}
                />
              </div>
            )}

            {/* Error — shown in error state */}
            {state === "error" && (
              <div>
                <div style={sectionLabelStyle}>Error Text</div>
                <textarea
                  style={textareaStyle}
                  value={errorText}
                  onChange={(e) => setErrorText(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Preview */}
          <div style={previewPaneStyle}>
            <div style={{ ...sectionLabelStyle, marginTop: 0 }}>Preview</div>
            <div key={previewKey}>{render(mockProps)}</div>

            {capturedResume !== undefined && (
              <div style={{ marginTop: 12 }}>
                <div style={sectionLabelStyle}>resume() was called with</div>
                <pre style={preStyle}>
                  {JSON.stringify(capturedResume, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
