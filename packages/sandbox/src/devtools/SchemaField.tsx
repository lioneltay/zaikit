import type React from "react";
import { useCallback, useState } from "react";
import { buildDefaultValues, type JsonSchema } from "../schema-utils";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#666",
  marginBottom: 2,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "0.875rem",
  border: "1px solid #ccc",
  borderRadius: 4,
  boxSizing: "border-box",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: "0.7rem",
  border: "1px solid #ccc",
  borderRadius: 3,
  cursor: "pointer",
  background: "#fff",
};

/**
 * Finds the original enum value matching a string representation.
 * HTML select always returns strings, so we need to recover the original type.
 */
function findEnumValue(enumValues: unknown[], stringValue: string): unknown {
  return enumValues.find((v) => String(v) === stringValue) ?? stringValue;
}

function ArrayField({
  name,
  schema,
  value,
  onChange,
  depth,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  depth: number;
}) {
  const items = schema.items as JsonSchema | undefined;
  const arr = Array.isArray(value) ? value : [];

  // If items schema is an object with properties, render structured fields
  if (items?.type === "object" && items.properties) {
    return (
      <div style={{ marginBottom: 8, marginLeft: depth * 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <label style={{ ...labelStyle, marginBottom: 0 }}>{name}</label>
          <button
            type="button"
            style={smallButtonStyle}
            onClick={() => onChange([...arr, buildDefaultValues(items)])}
          >
            + Add
          </button>
        </div>
        {arr.map((item, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #e8e8e8",
              borderRadius: 4,
              padding: "6px 8px",
              marginBottom: 4,
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <span style={{ fontSize: "0.65rem", color: "#aaa" }}>[{i}]</span>
              <button
                type="button"
                style={{
                  ...smallButtonStyle,
                  color: "#c00",
                  borderColor: "#dcc",
                }}
                onClick={() => onChange(arr.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
            <SchemaField
              name={`${name}[${i}]`}
              schema={items}
              value={item}
              onChange={(v) => {
                const next = [...arr];
                next[i] = v;
                onChange(next);
              }}
              depth={0}
            />
          </div>
        ))}
        {arr.length === 0 && (
          <div style={{ fontSize: "0.75rem", color: "#aaa", padding: 4 }}>
            No items. Click "+ Add" to add one.
          </div>
        )}
      </div>
    );
  }

  // Fallback: JSON textarea for arrays without known item schema
  return (
    <ArrayJsonField
      name={name}
      value={value}
      onChange={onChange}
      depth={depth}
    />
  );
}

/** JSON textarea for arrays that can't be rendered as structured fields. */
function ArrayJsonField({
  name,
  value,
  onChange,
  depth,
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
  depth: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? [], null, 2));

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
    <div style={{ marginBottom: 8, marginLeft: depth * 16 }}>
      <label style={labelStyle}>{name} (JSON)</label>
      <textarea
        style={{
          ...inputStyle,
          minHeight: 60,
          fontFamily: "monospace",
          fontSize: "0.8rem",
        }}
        value={text}
        onChange={handleChange}
      />
    </div>
  );
}

export function SchemaField({
  name,
  schema,
  value,
  onChange,
  depth = 0,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  depth?: number;
}) {
  const type = schema.type as string | undefined;
  const enumValues = schema.enum as unknown[] | undefined;
  const marginLeft = depth * 16;

  if (Array.isArray(enumValues)) {
    return (
      <div style={{ marginBottom: 8, marginLeft }}>
        <label style={labelStyle}>{name}</label>
        <select
          style={inputStyle}
          value={String(value ?? "")}
          onChange={(e) => onChange(findEnumValue(enumValues, e.target.value))}
        >
          {enumValues.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <div style={{ marginBottom: 8, marginLeft }}>
        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          {name}
        </label>
      </div>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <div style={{ marginBottom: 8, marginLeft }}>
        <label style={labelStyle}>{name}</label>
        <input
          type="number"
          style={inputStyle}
          value={(value as number) ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (type === "object") {
    const properties = schema.properties as
      | Record<string, JsonSchema>
      | undefined;
    if (!properties) return null;
    const objValue = (value ?? {}) as Record<string, unknown>;
    return (
      <div style={{ marginBottom: 8, marginLeft }}>
        {depth > 0 && <label style={labelStyle}>{name}</label>}
        {Object.entries(properties).map(([key, propSchema]) => (
          <SchemaField
            key={key}
            name={key}
            schema={propSchema}
            value={objValue[key]}
            onChange={(v) => onChange({ ...objValue, [key]: v })}
            depth={depth > 0 ? depth + 1 : 0}
          />
        ))}
      </div>
    );
  }

  if (type === "array") {
    return (
      <ArrayField
        name={name}
        schema={schema}
        value={value}
        onChange={onChange}
        depth={depth}
      />
    );
  }

  // Default: string
  return (
    <div style={{ marginBottom: 8, marginLeft }}>
      <label style={labelStyle}>{name}</label>
      <input
        type="text"
        style={inputStyle}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
