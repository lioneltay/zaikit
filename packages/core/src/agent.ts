import {
  streamText,
  generateText,
  convertToModelMessages,
  type LanguageModel,
  type UIMessage,
  type ToolSet,
  type StopCondition,
  type StreamTextResult,
} from "ai";
import type { Memory } from "./memory.js";

type CreateAgentOptions = {
  model: LanguageModel;
  system?: string;
  tools?: ToolSet;
  memory?: Memory;
  stopWhen?: StopCondition<ToolSet>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStreamTextResult = StreamTextResult<any, any>;

export type Agent = ReturnType<typeof createAgent>;

export function createAgent({
  model,
  system,
  tools,
  memory,
  stopWhen,
}: CreateAgentOptions): {
  memory: Memory | undefined;
  stream(
    messages: Parameters<typeof convertToModelMessages>[0],
  ): Promise<AnyStreamTextResult>;
  chat(options: {
    threadId: string;
    message: UIMessage;
  }): Promise<AnyStreamTextResult>;
} {
  const streamOptions = { model, system, tools, stopWhen };

  return {
    memory,
    async stream(messages) {
      return streamText({
        ...streamOptions,
        messages: await convertToModelMessages(messages),
      });
    },

    async chat({ threadId, message }) {
      if (!memory) {
        throw new Error("chat() requires memory to be configured on the agent");
      }

      const thread = await memory.getThread(threadId);
      if (!thread) {
        await memory.createThread(threadId);
      }

      await memory.addMessage(threadId, message);
      const messages = await memory.getMessages(threadId);

      const result = streamText({
        ...streamOptions,
        messages: await convertToModelMessages(messages),
        onFinish: async ({ steps }) => {
          try {
            const parts: UIMessage["parts"] = [];

            for (const step of steps) {
              for (const toolResult of step.toolResults) {
                parts.push({
                  type: "dynamic-tool",
                  toolName: toolResult.toolName,
                  toolCallId: toolResult.toolCallId,
                  state: "output-available",
                  input: toolResult.input,
                  output: toolResult.output,
                });
              }
              if (step.text) {
                parts.push({ type: "text", text: step.text });
              }
            }

            if (parts.length > 0) {
              await memory.addMessage(threadId, {
                id: crypto.randomUUID(),
                role: "assistant",
                parts,
              });
            }

            // Generate thread title if not yet set
            const existingThread = await memory.getThread(threadId);
            if (existingThread && existingThread.title === null) {
              const userText = message.parts
                .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                .map((p) => p.text)
                .join(" ");
              if (userText.trim()) {
                const titleResult = await generateText({
                  model,
                  system: "Generate a concise 3-6 word title for this conversation based on the user's message. Return only the title, no quotes or punctuation.",
                  prompt: userText,
                });
                const title = titleResult.text.trim();
                if (title) {
                  await memory.updateThread(threadId, { title });
                }
              }
            }
          } catch (err) {
            console.error("Failed to save assistant message:", err);
          }
        },
      });

      return result;
    },
  };
}
