import type { Agent, ToolMeta } from "@zaikit/core";
import type { LanguageModel, ToolSet } from "ai";
import { toJSONSchema } from "zod";

function getModelId(model: LanguageModel): string {
  if (typeof model === "string") return model;
  if ("modelId" in model && typeof model.modelId === "string")
    return model.modelId;
  return "unknown";
}

type ToolInfo = {
  name: string;
  description: string | undefined;
  parameters?: Record<string, unknown>;
  suspendSchema?: Record<string, unknown>;
  resumeSchema?: Record<string, unknown>;
};

function getToolInfo(name: string, t: ToolSet[string]): ToolInfo {
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
  };
}

export function listAgents(agents: Record<string, Agent>) {
  return Object.entries(agents).map(([name, agent]) => ({
    name,
    model: getModelId(agent.model),
    toolCount: Object.keys(agent.tools).length,
  }));
}

export function getAgentDetail(name: string, agent: Agent) {
  return {
    name,
    model: getModelId(agent.model),
    system: agent.system,
    tools: Object.entries(agent.tools).map(([toolName, t]) =>
      getToolInfo(toolName, t),
    ),
  };
}
