import type {
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { Agent, ChatOptions } from "../agent-types";

type StreamResponseFactory = () => LanguageModelV3StreamResult;

const defaultUsage = {
  inputTokens: {
    total: 10 as number | undefined,
    noCache: undefined as number | undefined,
    cacheRead: undefined as number | undefined,
    cacheWrite: undefined as number | undefined,
  },
  outputTokens: {
    total: 5 as number | undefined,
    text: undefined as number | undefined,
    reasoning: undefined as number | undefined,
  },
};

const defaultFinishReason = { unified: "stop" as const, raw: "stop" };

/** Create a factory that produces a model stream response with text. */
export function textResponse(text: string): StreamResponseFactory {
  return () => ({
    stream: simulateReadableStream<LanguageModelV3StreamPart>({
      initialDelayInMs: null,
      chunkDelayInMs: null,
      chunks: [
        { type: "text-start", id: "t-1" },
        { type: "text-delta", id: "t-1", delta: text },
        { type: "text-end", id: "t-1" },
        {
          type: "finish",
          finishReason: defaultFinishReason,
          usage: defaultUsage,
        },
      ],
    }),
  });
}

/** Create a factory that produces a model stream response that calls a tool. */
export function toolCallResponse(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
): StreamResponseFactory {
  return () => ({
    stream: simulateReadableStream<LanguageModelV3StreamPart>({
      initialDelayInMs: null,
      chunkDelayInMs: null,
      chunks: [
        {
          type: "tool-call",
          toolCallId,
          toolName,
          input: JSON.stringify(args),
        },
        {
          type: "finish",
          finishReason: { unified: "tool-calls" as const, raw: "tool-calls" },
          usage: defaultUsage,
        },
      ],
    }),
  });
}

/** Create a factory that produces a model stream response calling multiple tools. */
export function multiToolCallResponse(
  calls: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }[],
): StreamResponseFactory {
  return () => ({
    stream: simulateReadableStream<LanguageModelV3StreamPart>({
      initialDelayInMs: null,
      chunkDelayInMs: null,
      chunks: [
        ...calls.map(
          (c): LanguageModelV3StreamPart => ({
            type: "tool-call",
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            input: JSON.stringify(c.args),
          }),
        ),
        {
          type: "finish",
          finishReason: { unified: "tool-calls" as const, raw: "tool-calls" },
          usage: defaultUsage,
        },
      ],
    }),
  });
}

/**
 * Create a MockLanguageModelV3 with sequential stream responses.
 * Each factory is called once per doStream invocation, producing a fresh stream.
 * Also provides a default doGenerate for fire-and-forget calls (e.g. title generation).
 */
export function mockModel(
  responseFactories: StreamResponseFactory[],
): MockLanguageModelV3 {
  let callIndex = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      if (callIndex >= responseFactories.length) {
        throw new Error(
          `mockModel: unexpected doStream call #${callIndex + 1} (only ${responseFactories.length} responses configured)`,
        );
      }
      const factory = responseFactories[callIndex];
      callIndex++;
      return factory();
    },
    doGenerate: {
      content: [{ type: "text" as const, text: "Generated Title" }],
      finishReason: defaultFinishReason,
      usage: defaultUsage,
      warnings: [] as [],
    },
  });
}

/** Create a user UIMessage. */
export function userMessage(text: string, id?: string): UIMessage {
  return {
    id: id ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

/** Drain a streaming Response, return parsed messages from memory. */
export async function chatAndConsume(
  agent: Agent,
  options: ChatOptions,
): Promise<{ messages: UIMessage[] }> {
  const response = await agent.chat(options);
  await response.text(); // drain the stream, triggers onFinish
  const messages = (await agent.memory?.getMessages(options.threadId)) ?? [];
  return { messages };
}
