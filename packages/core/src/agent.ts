import type { Memory } from "@zaikit/memory";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  jsonSchema,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  type PrepareStepResult,
  type StepResult,
  streamText,
  type Tool,
  type ToolSet,
  tool,
  type UIMessage,
} from "ai";
import { toJSONSchema, type z } from "zod";
import {
  composeMiddleware,
  createAbort,
  type Middleware,
  type MiddlewareContext,
} from "./middleware/core";
import { isSuspendResult } from "./suspend";
import { getToolInjection, runWithToolInjection } from "./tool-injection";

// --- Hook context types ---

export type AfterStepContext = {
  /** The step that just completed. */
  step: StepResult<ToolSet>;
  /** All steps completed so far, including this one. */
  steps: StepResult<ToolSet>[];
};

export type BeforeToolCallContext = {
  toolName: string;
  toolCallId: string;
  input: unknown;
};

export type AfterToolCallContext = {
  toolName: string;
  toolCallId: string;
  input: unknown;
  output: unknown;
};

// --- Tool config types ---

type MappedToolEntry<C> = {
  tool: Tool<any, any>;
  mapContext: (ctx: C) => unknown;
};

type ToolConfigValue<C = undefined> = [C] extends [undefined]
  ? Tool<any, any>
  : Tool<any, any> | MappedToolEntry<C>;

type ResolveToolEntry<E> = E extends { tool: infer T extends Tool<any, any> }
  ? T
  : E;

type ResolveToolsConfig<T> = {
  [K in keyof T]: ResolveToolEntry<T[K]>;
};

type ValidateMappedTools<T, C> = {
  [K in keyof T]: T[K] extends {
    tool: { readonly __toolTypes: { readonly context: infer TC } };
    mapContext: any;
  }
    ? {
        tool: T[K] extends { tool: infer U } ? U : never;
        mapContext: (ctx: C) => TC;
      }
    : T[K];
};

// --- PrepareStep ---

export type PrepareStep<
  TOOLS extends ToolSet = ToolSet,
  C = undefined,
> = (options: {
  steps: StepResult<ToolSet>[];
  stepNumber: number;
  model: LanguageModel;
  messages: ModelMessage[];
  context: C;
}) =>
  | PrepareStepResult<NoInfer<TOOLS>>
  | PromiseLike<PrepareStepResult<NoInfer<TOOLS>>>;

// --- CreateAgentOptions ---

type CreateAgentOptions<
  T extends Record<string, ToolConfigValue<C>> = ToolSet,
  C = undefined,
> = ([C] extends [undefined]
  ? { context?: never }
  : { context: z.ZodType<C> }) & {
  model: LanguageModel;
  system?: string | ((context: C) => string | Promise<string>);
  tools?: T & ValidateMappedTools<T, C>;
  memory?: Memory;
  middleware?: Middleware[];
  prepareStep?: PrepareStep<ResolveToolsConfig<T> & ToolSet, C>;
  onAfterStep?: (ctx: AfterStepContext) => Promise<void> | void;
  onBeforeToolCall?: (
    ctx: BeforeToolCallContext,
  ) =>
    | Promise<{ input?: unknown } | undefined>
    | { input?: unknown }
    | undefined;
  onAfterToolCall?: (
    ctx: AfterToolCallContext,
  ) =>
    | Promise<{ output?: unknown } | undefined>
    | { output?: unknown }
    | undefined;
};

// --- Frontend tool types ---

export type FrontendToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// --- ChatOptions ---

export type ChatOptions<C = undefined> = ([C] extends [undefined]
  ? { context?: never }
  : { context: C }) &
  (
    | {
        threadId: string;
        message: UIMessage;
        ownerId?: string;
        frontendTools?: FrontendToolDef[];
      }
    | {
        threadId: string;
        resume: { toolCallId: string; data: unknown };
        frontendTools?: FrontendToolDef[];
      }
    | {
        threadId: string;
        toolOutputs: { toolCallId: string; output: unknown }[];
        frontendTools?: FrontendToolDef[];
      }
  );

// --- Stream / Generate types ---

export type AgentResult = {
  text: string;
  output: unknown;
  steps: StepResult<ToolSet>[];
  finishReason: string;
  usage: LanguageModelUsage;
};

export type StreamOptions<C = undefined> = ([C] extends [undefined]
  ? { context?: never }
  : { context: C }) & {
  messages: UIMessage[];
  model?: LanguageModel;
  threadId?: string;
  maxSteps?: number;
  output?: z.ZodType;
  frontendTools?: FrontendToolDef[];
};

export type StreamResult = {
  stream: ReadableStream<unknown>;
  result: Promise<AgentResult>;
};

type BaseGenerateOptions<C = undefined> = ([C] extends [undefined]
  ? { context?: never }
  : { context: C }) & {
  model?: LanguageModel;
  maxSteps?: number;
  frontendTools?: FrontendToolDef[];
} & ({ prompt: string } | { messages: UIMessage[] });

export type GenerateOptions<C = undefined> = BaseGenerateOptions<C> & {
  output?: z.ZodType;
};

export type GenerateResult<OUTPUT extends z.ZodType = never> = AgentResult & {
  output: [OUTPUT] extends [never] ? undefined : z.infer<OUTPUT>;
};

// --- Agent type ---

export type Agent<T extends ToolSet = ToolSet, C = undefined> = {
  tools: T;
  memory: Memory | undefined;
  model: LanguageModel;
  system: string | ((context: C) => string | Promise<string>) | undefined;
  contextSchema: Record<string, unknown> | undefined;
  stream(options: StreamOptions<C>): Promise<StreamResult>;
  chat(options: ChatOptions<C>): Promise<Response>;
  generate<OUTPUT extends z.ZodType = never>(
    options: BaseGenerateOptions<C> & { output?: OUTPUT },
  ): Promise<GenerateResult<OUTPUT>>;
};

// --- Helpers ---

function addTokenCounts(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  return a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
}

function sumUsage(steps: StepResult<ToolSet>[]): LanguageModelUsage {
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

/**
 * Wrap each tool's execute function with onBeforeToolCall/onAfterToolCall hooks.
 */
function wrapToolsWithHooks(
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
function resolveToolEntries(
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

// --- createAgent ---

export function createAgent<
  T extends Record<string, ToolConfigValue<C>>,
  C = undefined,
>(
  options: CreateAgentOptions<T, C>,
): Agent<ResolveToolsConfig<T> & ToolSet, C> {
  const {
    model,
    system,
    memory,
    middleware = [],
    prepareStep,
    onAfterStep,
    onBeforeToolCall,
    onAfterToolCall,
  } = options;
  const contextSchema = (options as any).context as z.ZodType | undefined;
  const resolvedTools = resolveToolEntries(options.tools ?? {});

  function buildDynamicTools(defs: FrontendToolDef[]): ToolSet {
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

  function mergeTools(frontendTools?: FrontendToolDef[]): ToolSet {
    return { ...resolvedTools, ...buildDynamicTools(frontendTools ?? []) };
  }

  /**
   * Core agent loop that produces a ReadableStream of UI message chunks.
   * Accepts a MiddlewareContext so middleware can mutate tools, messages,
   * and model before the loop runs.
   *
   * Callbacks:
   * - onResult: called with structured results before the stream closes
   * - onError: called if the loop throws, before the stream errors
   */
  function coreAgentStream(
    ctx: MiddlewareContext,
    callbacks?: {
      maxSteps?: number;
      output?: Output.Output;
      onResult?: (result: AgentResult) => void;
      onError?: (err: unknown) => void;
    },
  ): ReadableStream<unknown> {
    // toolName isn't available on tool-output-available chunks, so we track
    // the mapping from tool-input-start/tool-input-available chunks.
    const toolNameMap = new Map<string, string>();

    return new ReadableStream({
      async start(controller) {
        try {
          let currentModelMessages = await convertToModelMessages(ctx.messages);
          let isFirstStep = true;
          let stepNumber = 0;
          const allSteps: StepResult<ToolSet>[] = [];

          while (true) {
            // Per-step overrides via prepareStep (ephemeral — starts from base each time)
            const overrides =
              (await prepareStep?.({
                steps: allSteps,
                stepNumber,
                model: ctx.model,
                messages: currentModelMessages,
                context: getToolInjection().context as C,
              })) ?? {};

            // Apply activeTools filter
            let stepTools = ctx.tools;
            if (overrides.activeTools) {
              stepTools = Object.fromEntries(
                Object.entries(ctx.tools).filter(([name]) =>
                  (overrides.activeTools as string[]).includes(name),
                ),
              );
            }

            const result = streamText({
              model: overrides.model ?? ctx.model,
              system: overrides.system ?? ctx.system,
              tools: wrapToolsWithHooks(stepTools, {
                onBeforeToolCall,
                onAfterToolCall,
              }),
              messages: overrides.messages ?? currentModelMessages,
              toolChoice: overrides.toolChoice,
              providerOptions: overrides.providerOptions,
              output: callbacks?.output,
            });

            const uiStream = result.toUIMessageStream({
              sendStart: isFirstStep,
              sendFinish: false,
            });
            isFirstStep = false;

            let hasSuspension = false;

            // Consume the stream chunk-by-chunk. This replaces SuspendResult
            // tool outputs with data-tool-suspend parts and detects suspension.
            for await (const chunk of uiStream) {
              if (
                (chunk.type === "tool-input-start" ||
                  chunk.type === "tool-input-available") &&
                "toolName" in chunk
              ) {
                toolNameMap.set(chunk.toolCallId, chunk.toolName as string);
              }

              if (
                chunk.type === "tool-output-available" &&
                isSuspendResult(chunk.output)
              ) {
                hasSuspension = true;
                controller.enqueue({
                  type: "data-tool-suspend",
                  id: chunk.toolCallId,
                  data: {
                    toolCallId: chunk.toolCallId,
                    toolName: toolNameMap.get(chunk.toolCallId) ?? "unknown",
                    payload: chunk.output.payload,
                  },
                });
                continue;
              }

              controller.enqueue(chunk);
            }

            // Stream consumed — check stop conditions
            if (hasSuspension) break;

            // Accumulate step results
            const resultSteps = await result.steps;
            allSteps.push(...(resultSteps as unknown as StepResult<ToolSet>[]));

            const finishReason = await result.finishReason;

            // Step-level after hook — receives current step and all steps
            if (onAfterStep) {
              const currentStep = allSteps[allSteps.length - 1];
              await onAfterStep({
                step: currentStep,
                steps: [...allSteps],
              });
            }

            if (finishReason === "stop") break;

            // Check maxSteps before continuing to next step
            if (
              callbacks?.maxSteps !== undefined &&
              stepNumber + 1 >= callbacks.maxSteps
            ) {
              break;
            }

            // Chain: append response messages for the next step
            const response = await result.response;
            currentModelMessages = [
              ...currentModelMessages,
              ...response.messages,
            ];
            stepNumber++;
          }

          // Emit structured result before closing the stream
          const lastStep = allSteps[allSteps.length - 1];

          // Parse structured output from the last step's text
          let parsedOutput: unknown;
          if (callbacks?.output && lastStep?.finishReason === "stop") {
            parsedOutput = await callbacks.output.parseCompleteOutput(
              { text: lastStep.text },
              {
                response: lastStep.response,
                usage: lastStep.usage,
                finishReason: lastStep.finishReason,
              },
            );
          }

          callbacks?.onResult?.({
            text: lastStep?.text ?? "",
            output: parsedOutput,
            steps: allSteps,
            finishReason: lastStep?.finishReason ?? "stop",
            usage: sumUsage(allSteps),
          });

          controller.enqueue({ type: "finish" });
          controller.close();
        } catch (err) {
          callbacks?.onError?.(err);
          controller.error(err);
        }
      },
    });
  }

  /**
   * Pure agent execution pipeline. Runs middleware + core loop, returns
   * a stream of UI message chunks and a promise that resolves to structured
   * results when the stream completes.
   *
   * No memory, no persistence — the caller decides what to do with the output.
   */
  async function agentStream(opts: StreamOptions<C>): Promise<StreamResult> {
    // Validate context against schema if provided
    if (contextSchema) {
      contextSchema.parse((opts as any).context);
    }

    // Resolve system prompt once per request
    const resolvedSystem =
      typeof system === "function"
        ? await system((opts as any).context as C)
        : system;

    // Deferred result — resolve on success, reject on error.
    // Suppress unhandled rejection on the promise itself — callers that care
    // (generate) will await it; callers that don't (chat) won't see a warning.
    let resolveResult!: (r: AgentResult) => void;
    let rejectResult!: (err: unknown) => void;
    const resultPromise = new Promise<AgentResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    resultPromise.catch(() => {});

    // Wrap Zod schema into AI SDK Output spec
    const outputSpec = opts.output
      ? Output.object({ schema: opts.output })
      : undefined;

    // Compose middleware around core loop
    const chain = composeMiddleware(middleware, (ctx) =>
      coreAgentStream(ctx, {
        maxSteps: opts.maxSteps,
        output: outputSpec,
        onResult: resolveResult,
        onError: rejectResult,
      }),
    );

    // Build middleware context
    const mergedTools = mergeTools(opts.frontendTools);
    const ctx: MiddlewareContext = {
      messages: opts.messages,
      model: opts.model ?? model,
      system: resolvedSystem,
      tools: mergedTools,
      threadId: opts.threadId ?? crypto.randomUUID(),
      abort: createAbort(),
    };

    // Run under ALS so tools can access context
    const resultStream = runWithToolInjection(
      { context: (opts as any).context },
      () => chain(ctx),
    );

    return { stream: resultStream, result: resultPromise };
  }

  /**
   * Wrap an agent stream in a persistence layer, returning an HTTP Response.
   * Used by chat() and the resume/toolOutputs paths.
   */
  function streamToResponse(
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
        const reader = agentStreamResult.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value as any);
        }
      },
      onFinish: async ({ responseMessage }) => {
        if (opts.messageId) {
          await opts.memory.updateMessage(opts.threadId, opts.messageId, {
            parts: responseMessage.parts,
          });
        } else {
          await opts.memory.addMessage(opts.threadId, responseMessage);
        }
      },
    });

    return createUIMessageStreamResponse({ stream: uiStream });
  }

  // Fire-and-forget title generation
  async function generateThreadTitle(threadId: string, userMessage: UIMessage) {
    try {
      if (!memory) return;
      const thread = await memory.getThread(threadId);
      if (!thread || thread.title !== null) return;

      const userText = userMessage.parts
        .filter(
          (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
        )
        .map((p) => p.text)
        .join(" ");
      if (!userText.trim()) return;

      const titleResult = await generateText({
        model,
        system:
          "Generate a concise 3-6 word title for this conversation based on the user's message. Return only the title, no quotes or punctuation.",
        prompt: userText,
      });
      const title = titleResult.text.trim();
      if (title) {
        await memory.updateThread(threadId, { title });
      }
    } catch (err) {
      console.error("Failed to generate thread title:", err);
    }
  }

  /**
   * Resume a suspended tool call.
   *
   * Steps:
   *  1. Find the suspended message and its tool part
   *  2. Re-execute the tool with the user's resumeData
   *  3. Update the message in-place with the tool output
   *  4. If other tools in the same message are still suspended → 204 (no content)
   *  5. Otherwise continue the LLM with the updated conversation
   *
   * resumeData is passed via AsyncLocalStorage because the AI SDK's tool.execute
   * signature is fixed as (input, { toolCallId, messages }) — there's no way to
   * pass custom context through it directly. createTool reads it back internally
   * and exposes it as `{ resumeData }` to the tool author's execute function.
   */
  async function handleResume(
    threadId: string,
    resume: { toolCallId: string; data: unknown },
    frontendTools?: FrontendToolDef[],
    context?: unknown,
  ): Promise<Response> {
    if (!memory) {
      throw new Error(
        "handleResume requires memory to be configured on the agent",
      );
    }

    const allTools = mergeTools(frontendTools);

    if (Object.keys(allTools).length === 0) {
      throw new Error("handleResume requires tools to be configured");
    }

    // 1. Find the suspended message
    const messages = await memory.getMessages(threadId);
    const suspendedMsg = messages.find((m) =>
      m.parts.some(
        (p) =>
          p.type === "data-tool-suspend" &&
          (p as { data: { toolCallId: string } }).data.toolCallId ===
            resume.toolCallId,
      ),
    );

    if (!suspendedMsg) {
      throw new Error(
        `No suspended tool found with toolCallId: ${resume.toolCallId}`,
      );
    }

    // 2. Find the tool part to get the tool name and original input.
    //    Static tools use part type "tool-{name}"; dynamic tools use "dynamic-tool"
    //    with a separate toolName field.
    const toolPart = suspendedMsg.parts.find(
      (p) =>
        "toolCallId" in p &&
        (p as { toolCallId: string }).toolCallId === resume.toolCallId,
    ) as { type: string; toolName?: string; input: unknown } | undefined;

    if (!toolPart) {
      throw new Error(
        `No tool part found with toolCallId: ${resume.toolCallId}`,
      );
    }

    const toolName =
      toolPart.toolName ??
      (toolPart.type.startsWith("tool-")
        ? toolPart.type.slice("tool-".length)
        : undefined);
    const toolInput = toolPart.input;

    if (!toolName) {
      throw new Error(
        `Could not determine tool name from part type: ${toolPart.type}`,
      );
    }

    const toolDef = allTools[toolName];
    const execute = toolDef?.execute;
    if (!execute) {
      throw new Error(`Tool not found or has no execute: ${toolName}`);
    }

    // 3. Re-execute the tool with resumeData and agent context via AsyncLocalStorage
    const modelMessages = await convertToModelMessages(messages);
    const output = await runWithToolInjection(
      { context, resumeData: resume.data },
      () =>
        execute(toolInput, {
          toolCallId: resume.toolCallId,
          messages: modelMessages,
        }),
    );

    // 4. Update the message — fill in the tool output for the resolved tool
    //    and mark the corresponding data-tool-suspend part as resolved.
    const updatedParts = suspendedMsg.parts
      .map((p) => {
        if (
          p.type === "data-tool-suspend" &&
          (p as { data: { toolCallId: string } }).data.toolCallId ===
            resume.toolCallId
        ) {
          return { ...p, data: { ...(p as any).data, resolved: true } };
        }
        return p;
      })
      .map((p): UIMessage["parts"][number] => {
        if (
          "toolCallId" in p &&
          (p as { toolCallId: string }).toolCallId === resume.toolCallId &&
          (p.type === "dynamic-tool" || p.type.startsWith("tool-"))
        ) {
          return { ...(p as any), state: "output-available", output };
        }
        return p;
      });

    await memory.updateMessage(threadId, suspendedMsg.id, {
      parts: updatedParts,
    });

    // 5. Check for remaining unresolved suspensions (supports multiple
    //    suspendable tools called in a single LLM step)
    const hasRemainingSuspensions = updatedParts.some(
      (p) => p.type === "data-tool-suspend" && !(p as any).data?.resolved,
    );

    if (hasRemainingSuspensions) {
      // Client should re-fetch messages and show remaining suspend prompts
      return new Response(null, { status: 204 });
    }

    // 6. All suspensions resolved — continue the LLM
    const allMessages = await memory.getMessages(threadId);
    const sr = await agentStream({
      messages: allMessages,
      threadId,
      frontendTools,
      context,
    } as StreamOptions<C>);
    return streamToResponse(sr, allMessages, {
      memory,
      threadId,
      messageId: suspendedMsg.id,
    });
  }

  /**
   * Handle frontend tool outputs submitted via addToolOutput / sendAutomaticallyWhen.
   *
   * Steps:
   *  1. Get messages from memory
   *  2. Find last assistant message
   *  3. Update matching tool parts: input-available → output-available with output
   *  4. Save updated message to memory
   *  5. Check for remaining backend suspensions → if any, return 204
   *  6. Continue LLM with updated conversation
   */
  async function handleToolOutputs(
    threadId: string,
    toolOutputs: { toolCallId: string; output: unknown }[],
    frontendTools?: FrontendToolDef[],
    context?: unknown,
  ): Promise<Response> {
    if (!memory) {
      throw new Error(
        "handleToolOutputs requires memory to be configured on the agent",
      );
    }

    const messages = await memory.getMessages(threadId);
    // Find the last assistant message (where tool calls live)
    const lastAssistantMsg = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    if (!lastAssistantMsg) {
      throw new Error("No assistant message found to apply tool outputs to");
    }

    // Build a map of toolCallId → output for quick lookup
    const outputMap = new Map(toolOutputs.map((o) => [o.toolCallId, o.output]));

    // Update matching tool parts: input-available → output-available
    const updatedParts = lastAssistantMsg.parts.map(
      (p): UIMessage["parts"][number] => {
        if (
          "toolCallId" in p &&
          outputMap.has((p as { toolCallId: string }).toolCallId)
        ) {
          return {
            ...(p as any),
            state: "output-available",
            output: outputMap.get((p as { toolCallId: string }).toolCallId),
          };
        }
        return p;
      },
    );

    await memory.updateMessage(threadId, lastAssistantMsg.id, {
      parts: updatedParts,
    });

    // Check for remaining backend suspensions (data-tool-suspend parts that aren't resolved)
    const hasRemainingSuspensions = updatedParts.some(
      (p) => p.type === "data-tool-suspend" && !(p as any).data?.resolved,
    );

    if (hasRemainingSuspensions) {
      return new Response(null, { status: 204 });
    }

    // Continue LLM with updated conversation
    const allMessages = await memory.getMessages(threadId);
    const sr = await agentStream({
      messages: allMessages,
      threadId,
      frontendTools,
      context,
    } as StreamOptions<C>);
    return streamToResponse(sr, allMessages, { memory, threadId });
  }

  return {
    tools: resolvedTools as ResolveToolsConfig<T> & ToolSet,
    memory,
    model,
    system,
    contextSchema: contextSchema
      ? (toJSONSchema(contextSchema) as Record<string, unknown>)
      : undefined,

    async stream(opts: StreamOptions<C>): Promise<StreamResult> {
      return agentStream(opts);
    },

    async chat(options: ChatOptions<C>): Promise<Response> {
      if (!memory) {
        throw new Error("chat() requires memory to be configured on the agent");
      }

      const frontendTools = options.frontendTools;
      const context = (options as any).context;

      if ("resume" in options) {
        return handleResume(
          options.threadId,
          options.resume,
          frontendTools,
          context,
        );
      }

      if ("toolOutputs" in options) {
        return handleToolOutputs(
          options.threadId,
          options.toolOutputs,
          frontendTools,
          context,
        );
      }

      const { threadId, message, ownerId } = options;

      const thread = await memory.getThread(threadId);
      if (!thread) {
        await memory.createThread(threadId, undefined, ownerId);
      }

      await memory.addMessage(threadId, message);
      const messages = await memory.getMessages(threadId);

      // Title generation runs in parallel — fire-and-forget
      generateThreadTitle(threadId, message);

      const sr = await agentStream({
        messages,
        threadId,
        frontendTools,
        context,
      } as StreamOptions<C>);
      return streamToResponse(sr, messages, { memory, threadId });
    },

    async generate<OUTPUT extends z.ZodType = never>(
      opts: BaseGenerateOptions<C> & { output?: OUTPUT },
    ): Promise<GenerateResult<OUTPUT>> {
      const messages: UIMessage[] =
        "prompt" in opts
          ? [
              {
                id: crypto.randomUUID(),
                role: "user" as const,
                parts: [{ type: "text" as const, text: opts.prompt }],
              },
            ]
          : opts.messages;

      const { stream, result } = await agentStream({
        messages,
        model: opts.model,
        maxSteps: opts.maxSteps ?? 10,
        output: opts.output,
        frontendTools: opts.frontendTools,
        context: (opts as any).context,
      } as StreamOptions<C>);

      // Consume the stream — detect suspension (not supported in generate)
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if ((value as any)?.type === "data-tool-suspend") {
          throw new Error(
            "Tool suspension is not supported in generate(). " +
              "Use chat() for tools that call suspend().",
          );
        }
      }

      return (await result) as GenerateResult<OUTPUT>;
    },
  };
}
