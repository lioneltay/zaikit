import type { Memory } from "@zaikit/memory";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  jsonSchema,
  type LanguageModel,
  type PrepareStepFunction,
  type StepResult,
  streamText,
  type ToolSet,
  tool,
  type UIMessage,
} from "ai";
import {
  composeMiddleware,
  createAbort,
  type Middleware,
  type MiddlewareContext,
} from "./middleware";
import { isSuspendResult } from "./suspend";
import { runWithSuspendContext } from "./suspend-context";

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

type CreateAgentOptions<T extends ToolSet = ToolSet> = {
  model: LanguageModel;
  system?: string;
  tools?: T;
  memory?: Memory;
  middleware?: Middleware[];
  prepareStep?: PrepareStepFunction<T>;
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

export type FrontendToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatOptions =
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
    };

export type Agent<T extends ToolSet = ToolSet> = {
  tools: T;
  memory: Memory | undefined;
  chat(options: ChatOptions): Promise<Response>;
};

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

export function createAgent<T extends ToolSet>({
  model,
  system,
  tools,
  memory,
  middleware = [],
  prepareStep,
  onAfterStep,
  onBeforeToolCall,
  onAfterToolCall,
}: CreateAgentOptions<T>): Agent<T> {
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
    return { ...tools, ...buildDynamicTools(frontendTools ?? []) };
  }

  /**
   * Core agent loop that produces a ReadableStream of UI message chunks.
   * Accepts a MiddlewareContext so middleware can mutate tools, messages,
   * and model before the loop runs.
   */
  function coreAgentStream(ctx: MiddlewareContext): ReadableStream<unknown> {
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
              } as any)) ?? {};

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
              system: overrides.system ?? system,
              tools: wrapToolsWithHooks(stepTools, {
                onBeforeToolCall,
                onAfterToolCall,
              }) as T,
              messages: overrides.messages ?? currentModelMessages,
              toolChoice: overrides.toolChoice,
              providerOptions: overrides.providerOptions,
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

            // Chain: append response messages for the next step
            const response = await result.response;
            currentModelMessages = [
              ...currentModelMessages,
              ...response.messages,
            ];
            stepNumber++;
          }

          // Emit a single finish chunk to close the message
          controller.enqueue({ type: "finish" });
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  /**
   * Stream an LLM response back to the client.
   *
   * Uses a manual loop of single-step streamText() calls instead of
   * delegating multi-step to the SDK. This gives us control between steps
   * for middleware, hooks, and suspension detection.
   *
   * When `messageId` is provided (resume path), onFinish updates the existing
   * suspended message in-place instead of creating a new assistant message.
   */
  function buildStreamResponse(
    messages: UIMessage[],
    options: {
      memory: Memory;
      threadId: string;
      messageId?: string;
      frontendTools?: FrontendToolDef[];
    },
  ): Response {
    const mergedTools = mergeTools(options.frontendTools);

    const chain = composeMiddleware(middleware, coreAgentStream);

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const ctx: MiddlewareContext = {
          messages,
          model,
          tools: mergedTools,
          threadId: options.threadId,
          abort: createAbort(),
        };

        const resultStream = chain(ctx);

        // Pipe the middleware output into the createUIMessageStream writer
        const reader = resultStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value as any);
        }
      },
      onFinish: async ({ responseMessage }) => {
        if (options.messageId) {
          await options.memory.updateMessage(
            options.threadId,
            options.messageId,
            { parts: responseMessage.parts },
          );
        } else {
          await options.memory.addMessage(options.threadId, responseMessage);
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
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

    // 3. Re-execute the tool with resumeData via AsyncLocalStorage
    const modelMessages = await convertToModelMessages(messages);
    const output = await runWithSuspendContext(
      { resumeData: resume.data },
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
    return buildStreamResponse(allMessages, {
      memory,
      threadId,
      messageId: suspendedMsg.id,
      frontendTools,
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
    return buildStreamResponse(allMessages, {
      memory,
      threadId,
      frontendTools,
    });
  }

  return {
    tools: tools ?? ({} as T),
    memory,
    async chat(options: ChatOptions): Promise<Response> {
      if (!memory) {
        throw new Error("chat() requires memory to be configured on the agent");
      }

      const frontendTools = options.frontendTools;

      if ("resume" in options) {
        return handleResume(options.threadId, options.resume, frontendTools);
      }

      if ("toolOutputs" in options) {
        return handleToolOutputs(
          options.threadId,
          options.toolOutputs,
          frontendTools,
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

      return buildStreamResponse(messages, { memory, threadId, frontendTools });
    },
  };
}
