import { getBasePath } from "./utils/basepath";

export const BASE = `${getBasePath()}/api`;

export type AgentSummary = {
  name: string;
  model: string;
  toolCount: number;
};

export type ToolInfo = {
  name: string;
  description: string | undefined;
  parameters: Record<string, unknown> | undefined;
  suspendSchema?: Record<string, unknown>;
  resumeSchema?: Record<string, unknown>;
  contextSchema?: Record<string, unknown>;
};

export type AgentDetail = {
  name: string;
  model: string;
  system: string | undefined;
  contextSchema?: Record<string, unknown>;
  context?: Record<string, unknown>;
  tools: ToolInfo[];
};

export type Thread = {
  id: string;
  title: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchAgents(): Promise<AgentSummary[]> {
  const res = await fetch(`${BASE}/agents`);
  return res.json();
}

export async function fetchAgentDetail(name: string): Promise<AgentDetail> {
  const res = await fetch(`${BASE}/agents/${name}`);
  return res.json();
}

export async function fetchThreads(agentName: string): Promise<Thread[]> {
  const res = await fetch(`${BASE}/agents/${agentName}/threads`);
  return res.json();
}

export async function fetchMessages(
  agentName: string,
  threadId: string,
): Promise<unknown[]> {
  const res = await fetch(
    `${BASE}/agents/${agentName}/threads/${threadId}/messages`,
  );
  return res.json();
}

export async function deleteThread(
  agentName: string,
  threadId: string,
): Promise<void> {
  await fetch(`${BASE}/agents/${agentName}/threads/${threadId}`, {
    method: "DELETE",
  });
}

export type ToolExecutionResult = {
  ok: boolean;
  output?: unknown;
  suspended?: boolean;
  suspendPayload?: unknown;
  error?: string;
};

export async function executeTool(
  agentName: string,
  toolName: string,
  input: unknown,
  context?: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const res = await fetch(
    `${BASE}/agents/${agentName}/tools/${toolName}/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, ...(context ? { context } : {}) }),
    },
  );
  return res.json();
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

export async function fetchToolSchemas(
  agentName: string,
): Promise<ToolSchemaMap> {
  const res = await fetch(`${BASE}/agents/${agentName}/schemas`);
  return res.json();
}
