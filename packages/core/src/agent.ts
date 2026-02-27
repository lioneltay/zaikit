import {
  streamText,
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

      await memory.addMessage(threadId, message);
      const messages = await memory.getMessages(threadId);

      const result = streamText({
        ...streamOptions,
        messages: await convertToModelMessages(messages),
      });

      // Save assistant message after stream completes (fire-and-forget).
      void (async () => {
        try {
          await result.response;
          const steps = await result.steps;
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
        } catch (err) {
          console.error("Failed to save assistant message:", err);
        }
      })();

      return result;
    },
  };
}
