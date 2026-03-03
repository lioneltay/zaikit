type JsonSchema = Record<string, unknown>;

/**
 * Convert a JSON Schema to a multiline TypeScript-like type string with indentation.
 *
 * Examples:
 *   { type: "boolean" }     → "boolean"
 *   { type: "string", enum: ["a","b"] } → '"a" | "b"'
 *   { type: "object", properties: { x: { type: "number" } }, required: ["x"] }
 *     → "{\n  x: number\n}"
 */
export function jsonSchemaToTypeString(schema: JsonSchema, indent = 0): string {
  const pad = "  ".repeat(indent);
  const innerPad = "  ".repeat(indent + 1);

  if (!schema || typeof schema !== "object") return "unknown";

  // enum — regardless of type
  const enumValues = schema.enum as unknown[] | undefined;
  if (Array.isArray(enumValues)) {
    return enumValues
      .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
      .join(" | ");
  }

  const type = schema.type as string | string[] | undefined;

  if (Array.isArray(type)) {
    return type
      .map((t) => jsonSchemaToTypeString({ ...schema, type: t }, indent))
      .join(" | ");
  }

  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const items = schema.items as JsonSchema | undefined;
      const inner = items ? jsonSchemaToTypeString(items, indent) : "unknown";
      const needsParens = inner.includes("|") || inner.includes(" ");
      return needsParens ? `(${inner})[]` : `${inner}[]`;
    }
    case "object": {
      const properties = schema.properties as
        | Record<string, JsonSchema>
        | undefined;
      if (!properties || Object.keys(properties).length === 0) {
        return "Record<string, unknown>";
      }
      const required = new Set((schema.required as string[] | undefined) ?? []);
      const fields = Object.entries(properties).map(([key, prop]) => {
        const opt = required.has(key) ? "" : "?";
        const val = jsonSchemaToTypeString(prop, indent + 1);
        return `${innerPad}${key}${opt}: ${val}`;
      });
      return `{\n${fields.join("\n")}\n${pad}}`;
    }
    default:
      return "unknown";
  }
}

/**
 * Build default form values from a JSON Schema.
 *   boolean → false, string → "" (or first enum value), number → 0, object → recurse
 */
export function buildDefaultValues(schema: JsonSchema): unknown {
  if (!schema || typeof schema !== "object") return undefined;

  const enumValues = schema.enum as unknown[] | undefined;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues[0];
  }

  const type = schema.type as string | undefined;

  switch (type) {
    case "boolean":
      return false;
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "array":
      return [];
    case "object": {
      const properties = schema.properties as
        | Record<string, JsonSchema>
        | undefined;
      if (!properties) return {};
      const result: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(properties)) {
        result[key] = buildDefaultValues(prop);
      }
      return result;
    }
    default:
      return undefined;
  }
}
