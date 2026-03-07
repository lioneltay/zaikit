import type { Memory } from "@zaikit/memory";
import {
  DATA_TOOL_SUSPEND,
  getToolName,
  hasToolCallId,
  isSuspendPart,
  isToolPart,
} from "@zaikit/utils";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  jsonSchema,
  Output,
  type StepResult,
  streamText,
  type ToolSet,
  tool,
  type UIMessage,
} from "ai";
import { toJSONSchema, type z } from "zod";
import {
  resolveToolEntries,
  sumUsage,
  wrapToolsWithHooks,
} from "./agent-helpers";
import type {
  Agent,
  AgentResult,
  BaseGenerateOptions,
  ChatOptions,
  CreateAgentOptions,
  DataCallbacks,
  FrontendToolDef,
  GenerateResult,
  ResolveToolsConfig,
  StreamOptions,
  StreamResult,
  ToolConfigValue,
} from "./agent-types";
import {
  composeMiddleware,
  createAbort,
  type MiddlewareContext,
} from "./middleware/core";
import { isSuspendResult } from "./suspend";
import { getToolInjection, runWithToolInjection } from "./tool-injection";
import {
  createWriteData,
  createWriteMetadata,
  type ToolDataEvent,
  type WriteDataPart,
} from "./write-data";

/** Extract context from options — needed because conditional context types prevent direct access */
function optContext(opts: object): unknown {
  return (opts as { context?: unknown }).context;
}

// --- Message part type helpers ---

/** AI SDK protocol chunk type for resolved tool outputs. */
const TOOL_OUTPUT_AVAILABLE = "tool-output-available" as const;

function hasUnresolvedSuspensions(parts: readonly object[]): boolean {
  return parts.some((p) => isSuspendPart(p) && !p.data.resolved);
}

/** Combine two optional callbacks into one that fires both (agent-level first, then per-request). */
function mergeCallbacks<T>(
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
    onData: agentOnData,
    onToolData: agentOnToolData,
    onMetadata: agentOnMetadata,
  } = options;
  const contextSchema = optContext(options) as z.ZodType | undefined;
  const resolvedTools = resolveToolEntries(options.tools ?? {});
  const hookedTools = wrapToolsWithHooks(resolvedTools, {
    onBeforeToolCall,
    onAfterToolCall,
  });

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
    if (!frontendTools?.length) return hookedTools;
    return { ...hookedTools, ...buildDynamicTools(frontendTools) };
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
      onData?: (part: WriteDataPart) => void;
      onToolData?: (event: ToolDataEvent) => void;
      onMetadata?: (metadata: Record<string, unknown>) => void;
    },
  ): ReadableStream<unknown> {
    // toolName isn't available on tool-output-available chunks, so we track
    // the mapping from tool-input-start/tool-input-available chunks.
    const toolNameMap = new Map<string, string>();

    return new ReadableStream({
      async start(controller) {
        try {
          // Create writeData that enqueues data parts on this stream's controller
          const writeDataImpl = createWriteData(
            (chunk) => controller.enqueue(chunk),
            callbacks?.onData,
            callbacks?.onToolData,
          );

          // Create writeMetadata that enqueues message-metadata chunks
          const writeMetadataImpl = createWriteMetadata(
            (chunk) => controller.enqueue(chunk),
            callbacks?.onMetadata,
          );

          // Wrap loop in ALS so tools can access writeData + writeMetadata (merges with outer context scope)
          await runWithToolInjection(
            { writeData: writeDataImpl, writeMetadata: writeMetadataImpl },
            async () => {
              let currentModelMessages = await convertToModelMessages(
                ctx.messages,
              );
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
                  tools: stepTools,
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
                    chunk.type === TOOL_OUTPUT_AVAILABLE &&
                    isSuspendResult(chunk.output)
                  ) {
                    hasSuspension = true;
                    controller.enqueue({
                      type: DATA_TOOL_SUSPEND,
                      id: chunk.toolCallId,
                      data: {
                        toolCallId: chunk.toolCallId,
                        toolName:
                          toolNameMap.get(chunk.toolCallId) ?? "unknown",
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
                allSteps.push(
                  ...(resultSteps as unknown as StepResult<ToolSet>[]),
                );

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
            },
          );

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
      contextSchema.parse(optContext(opts));
    }

    // Resolve system prompt once per request
    const resolvedSystem =
      typeof system === "function"
        ? await system(optContext(opts) as C)
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
        onData: mergeCallbacks(agentOnData, opts.onData),
        onToolData: mergeCallbacks(agentOnToolData, opts.onToolData),
        onMetadata: mergeCallbacks(agentOnMetadata, opts.onMetadata),
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
      { context: optContext(opts) },
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
    opts: {
      threadId: string;
      resume: { toolCallId: string; data: unknown };
      frontendTools?: FrontendToolDef[];
      context?: unknown;
    } & DataCallbacks,
  ): Promise<Response> {
    const { threadId, resume, frontendTools, context, ...callbacks } = opts;
    if (!memory) {
      throw new Error(
        "handleResume requires memory to be configured on the agent",
      );
    }

    // 1. Find the suspended message
    const messages = await memory.getMessages(threadId);
    const suspendedMsg = messages.find((m) =>
      m.parts.some(
        (p) => isSuspendPart(p) && p.data.toolCallId === resume.toolCallId,
      ),
    );

    if (!suspendedMsg) {
      throw new Error(
        `No suspended tool found with toolCallId: ${resume.toolCallId}`,
      );
    }

    // 2. Extract both the tool part and suspend part for this toolCallId.
    const toolPart = suspendedMsg.parts.find(
      (p) => hasToolCallId(p) && p.toolCallId === resume.toolCallId,
    );
    const suspendPart = suspendedMsg.parts.find(
      (p) => isSuspendPart(p) && p.data.toolCallId === resume.toolCallId,
    );

    if (!toolPart || !hasToolCallId(toolPart)) {
      throw new Error(
        `No tool part found with toolCallId: ${resume.toolCallId}`,
      );
    }
    if (!suspendPart || !isSuspendPart(suspendPart)) {
      throw new Error(
        `Suspend part not found for toolCallId: ${resume.toolCallId}`,
      );
    }

    const allTools = mergeTools(frontendTools);
    const toolName = getToolName(toolPart);
    const toolInput = (toolPart as any).input;

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

    // 3. Build a single streaming response that:
    //    a) Re-executes the tool (writeData streams live via ALS)
    //    b) Updates memory with the result
    //    c) If all suspensions resolved, continues the LLM
    const modelMessages = await convertToModelMessages(messages);
    const previousHistory = suspendPart.data.resumeHistory ?? [];
    const resumeHistory = [...previousHistory, resume.data];

    const uiStream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        // Immediately mark the suspend as resolved in the stream so the
        // client hides the confirmation UI before the tool re-executes.
        // If the tool re-suspends, a new suspend part will overwrite this
        // via the AI SDK's same-type+id dedup.
        writer.write({
          type: DATA_TOOL_SUSPEND,
          id: resume.toolCallId,
          data: {
            toolCallId: resume.toolCallId,
            toolName,
            resolved: true,
          },
        } as any);

        // Create writeData that writes directly to this stream's writer
        const writeDataImpl = createWriteData(
          (chunk) => writer.write(chunk as any),
          mergeCallbacks(agentOnData, callbacks.onData),
          mergeCallbacks(agentOnToolData, callbacks.onToolData),
        );

        // Create writeMetadata that writes directly to this stream's writer
        const writeMetadataImpl = createWriteMetadata(
          (chunk) => writer.write(chunk as any),
          mergeCallbacks(agentOnMetadata, callbacks.onMetadata),
        );

        // Re-execute tool with writeData, writeMetadata, resumeData, resumeHistory, and toolName
        const output = await runWithToolInjection(
          {
            context,
            resumeData: resume.data,
            resumeHistory,
            writeData: writeDataImpl,
            writeMetadata: writeMetadataImpl,
            toolName,
          },
          () =>
            execute(toolInput, {
              toolCallId: resume.toolCallId,
              messages: modelMessages,
            }),
        );

        if (isSuspendResult(output)) {
          // Tool re-suspended — stream a new suspend part (overwrites the
          // resolved marker via same type+id dedup).
          writer.write({
            type: DATA_TOOL_SUSPEND,
            id: resume.toolCallId,
            data: {
              toolCallId: resume.toolCallId,
              toolName,
              payload: output.payload,
              resumeHistory,
            },
          } as any);
          return;
        }

        // Emit tool output as a stream chunk — the SDK's transform finds the
        // matching tool part in responseMessage (cloned from originalMessages)
        // and updates it with state: "output-available" + output.
        writer.write({
          type: TOOL_OUTPUT_AVAILABLE,
          toolCallId: resume.toolCallId,
          output,
        } as any);

        // Build the resolved message with tool output applied and suspend
        // marked resolved. Used both for the suspension check and (if all
        // resolved) as the LLM continuation context.
        const resolvedMsg: UIMessage = {
          ...suspendedMsg,
          parts: suspendedMsg.parts.map((p): UIMessage["parts"][number] => {
            if (isSuspendPart(p) && p.data.toolCallId === resume.toolCallId) {
              return { ...p, data: { ...p.data, resolved: true } };
            }
            if (isToolPart(p) && p.toolCallId === resume.toolCallId) {
              return { ...(p as any), state: "output-available", output };
            }
            return p;
          }),
        };

        // If other tools are still suspended, stop here — the client
        // will re-fetch messages and show remaining suspend UIs.
        if (hasUnresolvedSuspensions(resolvedMsg.parts)) {
          return;
        }

        // All suspensions resolved — continue the LLM. Pass patched
        // messages in-process (avoids an intermediate memory write + read).
        // onFinish persists the final state including LLM continuation output.
        const continuationMessages = messages.map((m) =>
          m.id === suspendedMsg.id ? resolvedMsg : m,
        );
        const sr = await agentStream({
          messages: continuationMessages,
          threadId,
          frontendTools,
          context,
          ...callbacks,
        } as StreamOptions<C>);

        // Pipe the continuation stream through the same writer
        writer.merge(sr.stream as any);
      },
      onFinish: async ({ responseMessage }) => {
        // responseMessage is built from a structuredClone of the original
        // message plus all stream chunks applied by the SDK's transform.
        // tool-output-available, data-tool-suspend, data-*, message-metadata
        // are all reflected in responseMessage — just save it directly.
        await memory.updateMessage(threadId, suspendedMsg.id, {
          parts: responseMessage.parts,
          metadata: responseMessage.metadata,
        });
      },
    });

    return createUIMessageStreamResponse({ stream: uiStream });
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
    opts: {
      threadId: string;
      toolOutputs: { toolCallId: string; output: unknown }[];
      frontendTools?: FrontendToolDef[];
      context?: unknown;
    } & DataCallbacks,
  ): Promise<Response> {
    const { threadId, toolOutputs, frontendTools, context, ...callbacks } =
      opts;

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
        if (hasToolCallId(p) && outputMap.has(p.toolCallId)) {
          return {
            ...(p as any),
            state: "output-available",
            output: outputMap.get(p.toolCallId),
          };
        }
        return p;
      },
    );

    await memory.updateMessage(threadId, lastAssistantMsg.id, {
      parts: updatedParts,
    });

    // Check for remaining backend suspensions (data-tool-suspend parts that aren't resolved)
    if (hasUnresolvedSuspensions(updatedParts)) {
      return new Response(null, { status: 204 });
    }

    // Continue LLM with updated conversation
    const allMessages = await memory.getMessages(threadId);
    const sr = await agentStream({
      messages: allMessages,
      threadId,
      frontendTools,
      context,
      ...callbacks,
    } as StreamOptions<C>);
    return streamToResponse(sr, allMessages, { memory, threadId });
  }

  // Cast needed: the implementation uses StreamOptions<C> (untyped onToolData)
  // while Agent<T, C> exposes StreamOptions<C, T> (typed onToolData).
  // The typed narrowing is purely at the consumer side — runtime is identical.
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

      const { frontendTools, onData, onToolData, onMetadata } = options;
      const context = optContext(options);

      if ("resume" in options) {
        return handleResume({
          threadId: options.threadId,
          resume: options.resume,
          frontendTools,
          context,
          onData,
          onToolData,
          onMetadata,
        });
      }

      if ("toolOutputs" in options) {
        return handleToolOutputs({
          threadId: options.threadId,
          toolOutputs: options.toolOutputs,
          frontendTools,
          context,
          onData,
          onToolData,
          onMetadata,
        });
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
        onData,
        onToolData,
        onMetadata,
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
        context: optContext(opts),
        onData: opts.onData,
        onToolData: opts.onToolData,
        onMetadata: opts.onMetadata,
      } as StreamOptions<C>);

      // Consume the stream — detect suspension (not supported in generate)
      for await (const chunk of stream as any) {
        if (isSuspendPart(chunk)) {
          throw new Error(
            "Tool suspension is not supported in generate(). " +
              "Use chat() for tools that call suspend().",
          );
        }
      }

      return (await result) as GenerateResult<OUTPUT>;
    },
  } as Agent<ResolveToolsConfig<T> & ToolSet, C>;
}
