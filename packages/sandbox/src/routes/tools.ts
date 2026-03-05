import type { Agent } from "@zaikit/core";
import { isSuspendResult, runWithToolInjection } from "@zaikit/core";

type ToolExecutionResponse =
  | { ok: true; output: unknown; suspended: false }
  | { ok: true; output: null; suspended: true; suspendPayload: unknown }
  | { ok: false; error: string };

export async function executeTool(
  agent: Agent,
  toolName: string,
  input: unknown,
  context: unknown,
): Promise<ToolExecutionResponse> {
  const tool = agent.tools[toolName];
  if (!tool) {
    return { ok: false, error: `Tool "${toolName}" not found` };
  }

  if (typeof tool.execute !== "function") {
    return {
      ok: false,
      error: `Tool "${toolName}" has no execute function (frontend-only tool)`,
    };
  }

  try {
    const result = await runWithToolInjection({ context }, () =>
      tool.execute?.(input, {
        toolCallId: crypto.randomUUID(),
        messages: [],
      }),
    );

    if (isSuspendResult(result)) {
      return {
        ok: true,
        output: null,
        suspended: true,
        suspendPayload: result.payload,
      };
    }

    return { ok: true, output: result, suspended: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
