import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  jsonSchema,
  type LanguageModel,
  type StopCondition,
  streamText,
  type ToolSet,
  tool,
  type UIMessage,
} from "ai";
import type { Memory } from "./memory.js";
import { hasSuspendedTool } from "./stop-conditions.js";
import { isSuspendResult } from "./suspend.js";
import { runWithSuspendContext } from "./suspend-context.js";

type CreateAgentOptions<T extends ToolSet = ToolSet> = {
  model: LanguageModel;
  system?: string;
  tools?: T;
  memory?: Memory;
  stopWhen?: StopCondition<ToolSet>;
};

export type FrontendToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatOptions =
  | { threadId: string; message: UIMessage; frontendTools?: FrontendToolDef[] }
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

export function createAgent<T extends ToolSet>({
  model,
  system,
  tools,
  memory,
  stopWhen,
}: CreateAgentOptions<T>): Agent<T> {
  // Always stop when a tool suspends so the client can prompt the user.
  // User-provided stopWhen conditions are composed alongside this.
  // Cast: StopCondition<ToolSet> → StopCondition<T>. Safe because T extends
  // ToolSet and stop conditions only read tool results (contravariant).
  const composedStopWhen: StopCondition<T>[] = [
    hasSuspendedTool as unknown as StopCondition<T>,
  ];
  if (stopWhen) composedStopWhen.push(stopWhen as unknown as StopCondition<T>);

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
   * Stream an LLM response back to the client.
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
    // toolName isn't available on tool-output-available chunks, so we track
    // the mapping from tool-input-start/tool-input-available chunks.
    const toolNameMap = new Map<string, string>();

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          system,
          tools: mergedTools,
          stopWhen: composedStopWhen as unknown as StopCondition<ToolSet>[],
          messages: await convertToModelMessages(messages),
        });

        const uiStream = result.toUIMessageStream();

        // Intercept the UI message stream to replace SuspendResult tool outputs
        // with data-tool-suspend parts. This single transform fixes the shape
        // for both the client stream and server-side persistence (onFinish).
        const filtered = uiStream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
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
                // Strip the tool-output-available so the tool stays at
                // input-available on the client and in the persisted message.
                // Only emit data-tool-suspend so the client can show UI.
                controller.enqueue({
                  type: "data-tool-suspend" as const,
                  id: chunk.toolCallId,
                  data: {
                    toolCallId: chunk.toolCallId,
                    toolName: toolNameMap.get(chunk.toolCallId) ?? "unknown",
                    payload: chunk.output.payload,
                  },
                });
                return;
              }

              controller.enqueue(chunk);
            },
          }),
        );

        writer.merge(filtered);
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

      const { threadId, message } = options;

      const thread = await memory.getThread(threadId);
      if (!thread) {
        await memory.createThread(threadId);
      }

      await memory.addMessage(threadId, message);
      const messages = await memory.getMessages(threadId);

      // Title generation runs in parallel — fire-and-forget
      generateThreadTitle(threadId, message);

      return buildStreamResponse(messages, { memory, threadId, frontendTools });
    },
  };
}
