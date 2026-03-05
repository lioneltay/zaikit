import { useAgent } from "@zaikit/react";
import type { ToolSchema } from "./index";
import { ToolStory } from "./ToolStory";

export type DevToolsListProps = {
  schemas?: Record<string, ToolSchema>;
  searchQuery?: string;
};

const containerStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

function matchesSearch(
  name: string,
  schema: ToolSchema | undefined,
  query: string,
): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (name.toLowerCase().includes(q)) return true;
  if (schema?.description?.toLowerCase().includes(q)) return true;
  return false;
}

export function DevToolsList({ schemas, searchQuery = "" }: DevToolsListProps) {
  const { getRegisteredRenderers } = useAgent();
  const renderers = getRegisteredRenderers();

  const schemaNames = schemas ? Object.keys(schemas) : [];
  const rendererNames = renderers.map((r) => r.name);

  const namedRenderers = renderers
    .filter((r) => r.name !== "*")
    .filter((r) => matchesSearch(r.name, schemas?.[r.name], searchQuery));
  const wildcardRenderer = renderers.find((r) => r.name === "*");

  const schemaOnlyTools = schemaNames
    .filter((name) => !rendererNames.includes(name))
    .filter((name) => matchesSearch(name, schemas?.[name], searchQuery));

  return (
    <div style={containerStyle}>
      {namedRenderers.length === 0 && schemaOnlyTools.length === 0 && (
        <p style={{ color: "#888" }}>
          {searchQuery
            ? "No tools match your search."
            : "No tool renderers registered. Use useToolRenderer to register renderers."}
        </p>
      )}

      {namedRenderers.map((r) => (
        <ToolStory
          key={r.name}
          name={r.name}
          render={r.render}
          schema={schemas?.[r.name]}
        />
      ))}

      {schemaOnlyTools.length > 0 && (
        <>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#888",
              marginTop: 24,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Tools without renderers
          </h3>
          {schemaOnlyTools.map((name) => (
            <div
              key={name}
              style={{
                border: "1px dashed #ccc",
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                color: "#888",
              }}
            >
              <strong>{name}</strong>
              {schemas?.[name]?.description && (
                <span> — {schemas[name].description}</span>
              )}
              <div style={{ fontSize: "0.75rem", marginTop: 4 }}>
                No renderer registered. Use{" "}
                <code>useToolRenderer("{name}", ...)</code>
              </div>
            </div>
          ))}
        </>
      )}

      {wildcardRenderer && (
        <>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#888",
              marginTop: 24,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Wildcard renderer (*)
          </h3>
          <ToolStory name="*" render={wildcardRenderer.render} />
        </>
      )}
    </div>
  );
}
