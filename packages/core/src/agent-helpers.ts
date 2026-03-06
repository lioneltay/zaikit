import type { LanguageModelUsage, StepResult, Tool, ToolSet } from "ai";
import type { CreateAgentOptions } from "./agent-types";
import { getToolInjection, runWithToolInjection } from "./tool-injection";

// --- Usage aggregation ---

function addTokenCounts(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  return a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
}

export function sumUsage(steps: StepResult<ToolSet>[]): LanguageModelUsage {
  return steps.reduce<LanguageModelUsage>(
    (acc, step) => ({
      inputTokens: addTokenCounts(acc.inputTokens, step.usage?.inputTokens),
      inputTokenDetails: {
        noCacheTokens: addTokenCounts(
          acc.inputTokenDetails?.noCacheTokens,
          step.usage?.inputTokenDetails?.noCacheTokens,
        ),
        cacheReadTokens: addTokenCounts(
          acc.inputTokenDetails?.cacheReadTokens,
          step.usage?.inputTokenDetails?.cacheReadTokens,
        ),
        cacheWriteTokens: addTokenCounts(
          acc.inputTokenDetails?.cacheWriteTokens,
          step.usage?.inputTokenDetails?.cacheWriteTokens,
        ),
      },
      outputTokens: addTokenCounts(acc.outputTokens, step.usage?.outputTokens),
      outputTokenDetails: {
        textTokens: addTokenCounts(
          acc.outputTokenDetails?.textTokens,
          step.usage?.outputTokenDetails?.textTokens,
        ),
        reasoningTokens: addTokenCounts(
          acc.outputTokenDetails?.reasoningTokens,
          step.usage?.outputTokenDetails?.reasoningTokens,
        ),
      },
      totalTokens: addTokenCounts(acc.totalTokens, step.usage?.totalTokens),
    }),
    {
      inputTokens: undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: undefined,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: undefined,
    },
  );
}

// --- Tool wrapping ---

/**
 * Wrap each tool's execute function with onBeforeToolCall/onAfterToolCall hooks.
 */
export function wrapToolsWithHooks(
  tools: ToolSet,
  hooks: {
    onBeforeToolCall?: CreateAgentOptions["onBeforeToolCall"];
    onAfterToolCall?: CreateAgentOptions["onAfterToolCall"];
  },
): ToolSet {
  if (!hooks.onBeforeToolCall && !hooks.onAfterToolCall) return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => {
      if (!t.execute) return [name, t];
      const originalExecute = t.execute;
      return [
        name,
        {
          ...t,
          execute: async (input: unknown, context: any) => {
            let finalInput = input;
            if (hooks.onBeforeToolCall) {
              const beforeResult = await hooks.onBeforeToolCall({
                toolName: name,
                input,
                toolCallId: context.toolCallId,
              });
              if (beforeResult?.input !== undefined) {
                finalInput = beforeResult.input;
              }
            }

            const output = await originalExecute(finalInput, context);

            if (hooks.onAfterToolCall) {
              const afterResult = await hooks.onAfterToolCall({
                toolName: name,
                input: finalInput,
                output,
                toolCallId: context.toolCallId,
              });
              if (afterResult?.output !== undefined) {
                return afterResult.output;
              }
            }

            return output;
          },
        },
      ];
    }),
  );
}

// --- Tool resolution ---

function isMappedToolEntry(
  v: unknown,
): v is { tool: Tool<any, any>; mapContext: Function } {
  return (
    typeof v === "object" && v !== null && "mapContext" in v && "tool" in v
  );
}

/**
 * Resolve a tools config record to a plain ToolSet.
 * Entries with `{ tool, mapContext }` get their execute wrapped to
 * intercept the agent context from ALS, transform it via the mapper,
 * and re-inject the tool-specific context before calling the original execute.
 */
export function resolveToolEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: Record<string, any>,
): ToolSet {
  return Object.fromEntries(
    Object.entries(entries).map(([name, entry]) => {
      if (!isMappedToolEntry(entry)) return [name, entry];

      const { tool: sourceTool, mapContext } = entry;
      const originalExecute = sourceTool.execute;
      if (!originalExecute) return [name, sourceTool];

      return [
        name,
        {
          ...sourceTool,
          execute: async (input: unknown, sdkOptions: any) => {
            const { context: agentCtx } = getToolInjection();
            const toolCtx = mapContext(agentCtx);
            return runWithToolInjection({ context: toolCtx }, () =>
              originalExecute(input, sdkOptions),
            );
          },
        },
      ];
    }),
  );
}
