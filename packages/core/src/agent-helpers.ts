import type { Memory } from "@zaikit/memory";
import { isSuspendPart } from "@zaikit/utils";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  type LanguageModelUsage,
  type StepResult,
  type Tool,
  type ToolSet,
  tool,
  type UIMessage,
} from "ai";
import type {
  CreateAgentOptions,
  FrontendToolDef,
  StreamResult,
} from "./agent-types";
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
 * Wrap each tool's execute function to inject `toolName` via ALS and
 * apply onBeforeToolCall/onAfterToolCall hooks when present.
 *
 * Always wraps tools (even without hooks) so that `toolName` is available
 * to `createTool` via `getToolInjection()`.
 */
export function wrapToolsWithHooks(
  tools: ToolSet,
  hooks: {
    onBeforeToolCall?: CreateAgentOptions["onBeforeToolCall"];
    onAfterToolCall?: CreateAgentOptions["onAfterToolCall"];
  },
): ToolSet {
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

            // Inject toolName via ALS so createTool can read it
            const output = await runWithToolInjection({ toolName: name }, () =>
              originalExecute(finalInput, context),
            );

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

// --- Pure utilities (extracted from agent.ts) ---

/** Extract context from options — needed because conditional context types prevent direct access. */
export function optContext(opts: object): unknown {
  return (opts as { context?: unknown }).context;
}

export function hasUnresolvedSuspensions(parts: readonly object[]): boolean {
  return parts.some((p) => isSuspendPart(p) && !p.data.resolved);
}

/** Combine two optional callbacks into one that fires both (agent-level first, then per-request). */
export function mergeCallbacks<T>(
  a?: (arg: T) => void,
  b?: (arg: T) => void,
): ((arg: T) => void) | undefined {
  if (!a) return b;
  if (!b) return a;
  return (arg) => {
    a(arg);
    b(arg);
  };
}

export function buildDynamicTools(defs: FrontendToolDef[]): ToolSet {
  const result: ToolSet = {};
  for (const def of defs) {
    // Strip JSON Schema meta-fields that providers like Gemini reject
    const { $schema, additionalProperties, ...params } =
      def.parameters as Record<string, unknown>;
    // No execute — frontend tools stay at input-available so the client
    // can provide output via addToolOutput / toolOutputs.
    result[def.name] = tool({
      description: def.description,
      inputSchema: jsonSchema({ type: "object" as const, ...params }),
    } as any);
  }
  return result;
}

/**
 * Wrap an agent stream in a persistence layer, returning an HTTP Response.
 * Used by chat() and the resume/toolOutputs paths.
 */
export function streamToResponse(
  agentStreamResult: StreamResult,
  messages: UIMessage[],
  opts: {
    memory: Memory;
    threadId: string;
    messageId?: string;
  },
): Response {
  const uiStream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      for await (const chunk of agentStreamResult.stream as any) {
        writer.write(chunk as any);
      }
    },
    onFinish: async ({ responseMessage }) => {
      if (opts.messageId) {
        await opts.memory.updateMessage(opts.threadId, opts.messageId, {
          parts: responseMessage.parts,
          metadata: responseMessage.metadata,
        });
      } else {
        await opts.memory.addMessage(opts.threadId, responseMessage);
      }
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}
