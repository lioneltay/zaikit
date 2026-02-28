import {
  streamText,
  generateText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type UIMessage,
  type ToolSet,
  type StopCondition,
} from "ai";
import type { Memory } from "./memory.js";
import { isSuspendResult } from "./suspend.js";
import { hasSuspendedTool } from "./stop-conditions.js";
import { runWithSuspendContext } from "./suspend-context.js";

type CreateAgentOptions<T extends ToolSet = ToolSet> = {
  model: LanguageModel;
  system?: string;
  tools?: T;
  memory?: Memory;
  stopWhen?: StopCondition<ToolSet>;
};

export type ChatOptions =
  | { threadId: string; message: UIMessage }
  | { threadId: string; resume: { toolCallId: string; data: unknown } };

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

  const streamOptions = { model, system, tools, stopWhen: composedStopWhen };

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
    },
  ): Response {
    // toolName isn't available on tool-output-available chunks, so we track
    // the mapping from tool-input-start/tool-input-available chunks.
    const toolNameMap = new Map<string, string>();

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const result = streamText({
          ...streamOptions,
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
                // Replace the output chunk with a data part the client can render.
                // The original chunk is swallowed — never reaches the client or onFinish.
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
  async function generateThreadTitle(
    threadId: string,
    userMessage: UIMessage,
  ) {
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
  ): Promise<Response> {
    if (!memory) {
      throw new Error(
        "handleResume requires memory to be configured on the agent",
      );
    }
    if (!tools) {
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

    const toolDef = tools[toolName];
    if (!toolDef || !toolDef.execute) {
      throw new Error(`Tool not found or has no execute: ${toolName}`);
    }

    // 3. Re-execute the tool with resumeData via AsyncLocalStorage
    const modelMessages = await convertToModelMessages(messages);
    const output = await runWithSuspendContext(
      { resumeData: resume.data },
      () =>
        toolDef.execute!(toolInput, {
          toolCallId: resume.toolCallId,
          messages: modelMessages,
        }),
    );

    // 4. Update the message — fill in the tool output for the resolved tool
    const updatedParts = suspendedMsg.parts.map(
      (p): UIMessage["parts"][number] => {
        if (
          "toolCallId" in p &&
          (p as { toolCallId: string }).toolCallId === resume.toolCallId &&
          (p.type === "dynamic-tool" || p.type.startsWith("tool-"))
        ) {
          return { ...(p as any), state: "output-available", output };
        }
        return p;
      },
    );

    await memory.updateMessage(threadId, suspendedMsg.id, {
      parts: updatedParts,
    });

    // 5. Check for remaining unresolved suspensions (supports multiple
    //    suspendable tools called in a single LLM step)
    const resolvedToolCallIds = new Set(
      updatedParts
        .filter(
          (p) =>
            "toolCallId" in p &&
            (p as { state: string }).state === "output-available",
        )
        .map((p) => (p as { toolCallId: string }).toolCallId),
    );
    const hasRemainingSuspensions = updatedParts.some(
      (p) =>
        p.type === "data-tool-suspend" &&
        !resolvedToolCallIds.has(
          (p as { data: { toolCallId: string } }).data.toolCallId,
        ),
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
    });
  }

  return {
    tools: tools ?? ({} as T),
    memory,
    async chat(options: ChatOptions): Promise<Response> {
      if (!memory) {
        throw new Error(
          "chat() requires memory to be configured on the agent",
        );
      }

      if ("resume" in options) {
        return handleResume(options.threadId, options.resume);
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

      return buildStreamResponse(messages, { memory, threadId });
    },
  };
}
