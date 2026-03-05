import type { ToolMeta } from "@zaikit/core";
import type { LanguageModel, ToolSet } from "ai";
import { toJSONSchema } from "zod";
import type { NormalizedAgentEntry } from "../types";

function getModelId(model: LanguageModel): string {
  if (typeof model === "string") return model;
  if ("modelId" in model && typeof model.modelId === "string")
    return model.modelId;
  return "unknown";
}

export type ToolInfo = {
  name: string;
  description: string | undefined;
  parameters?: Record<string, unknown>;
  suspendSchema?: Record<string, unknown>;
  resumeSchema?: Record<string, unknown>;
  contextSchema?: Record<string, unknown>;
};

export function getToolInfo(name: string, t: ToolSet[string]): ToolInfo {
  const meta = (t as unknown as { __meta?: ToolMeta }).__meta;
  let parameters: Record<string, unknown> | undefined;
  try {
    const schema = (t as unknown as { inputSchema?: unknown }).inputSchema;
    if (schema && typeof schema === "object" && "def" in schema) {
      // It's a Zod schema — convert to JSON Schema
      parameters = toJSONSchema(schema as any) as Record<string, unknown>;
    }
  } catch {
    // Ignore conversion errors
  }
  return {
    name,
    description: t.description,
    ...(parameters ? { parameters } : {}),
    ...(meta?.suspendSchema ? { suspendSchema: meta.suspendSchema } : {}),
    ...(meta?.resumeSchema ? { resumeSchema: meta.resumeSchema } : {}),
    ...(meta?.contextSchema
      ? {
          contextSchema: toJSONSchema(meta.contextSchema) as Record<
            string,
            unknown
          >,
        }
      : {}),
  };
}

export function listAgents(entries: Record<string, NormalizedAgentEntry>) {
  return Object.entries(entries).map(([name, { agent }]) => ({
    name,
    model: getModelId(agent.model),
    toolCount: Object.keys(agent.tools).length,
  }));
}

export function getAgentDetail(name: string, entry: NormalizedAgentEntry) {
  const { agent } = entry;
  return {
    name,
    model: getModelId(agent.model),
    system: typeof agent.system === "function" ? "(dynamic)" : agent.system,
    contextSchema: agent.contextSchema,
    context: entry.context,
    tools: Object.entries(agent.tools).map(([toolName, t]) =>
      getToolInfo(toolName, t as ToolSet[string]),
    ),
  };
}

export type ToolSchemaMap = Record<
  string,
  {
    description?: string;
    input?: Record<string, unknown>;
    suspend?: Record<string, unknown>;
    resume?: Record<string, unknown>;
  }
>;

export function getAgentToolSchemas(
  entry: NormalizedAgentEntry,
): ToolSchemaMap {
  const result: ToolSchemaMap = {};
  for (const [name, t] of Object.entries(entry.agent.tools)) {
    const info = getToolInfo(name, t as ToolSet[string]);
    result[name] = {
      ...(info.description ? { description: info.description } : {}),
      ...(info.parameters ? { input: info.parameters } : {}),
      ...(info.suspendSchema ? { suspend: info.suspendSchema } : {}),
      ...(info.resumeSchema ? { resume: info.resumeSchema } : {}),
    };
  }
  return result;
}
