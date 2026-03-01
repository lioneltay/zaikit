import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useCallback, useMemo, useState } from "react";
import type { FrontendToolRegistration } from "./types.js";

export type UseAgentChatOptions = {
  api: string;
  threadId: string;
  initialMessages: UIMessage[];
  fetchMessages?: (threadId: string) => Promise<UIMessage[]>;
  onFinish?: () => void;
  getFrontendTools: () => FrontendToolRegistration[];
  isFrontendTool: (name: string) => boolean;
};

/** Extract tool name from a UIMessage part (handles both toolName prop and type prefix). */
function getToolName(p: unknown): string | undefined {
  const part = p as Record<string, unknown>;
  if (typeof part.toolName === "string") return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-"))
    return part.type.slice(5);
  return undefined;
}

export function useAgentChat({
  api,
  threadId,
  initialMessages,
  fetchMessages,
  onFinish,
  getFrontendTools,
  isFrontendTool,
}: UseAgentChatOptions) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api,
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          const frontendTools = getFrontendTools();

          if (lastMessage.role === "assistant") {
            // Tool output continuation — collect frontend tool outputs
            const toolOutputs = lastMessage.parts
              .filter((p) => {
                const name = getToolName(p);
                return (
                  "toolCallId" in p &&
                  name != null &&
                  isFrontendTool(name) &&
                  (p as any).state === "output-available"
                );
              })
              .map((p) => ({
                toolCallId: (p as any).toolCallId,
                output: (p as any).output,
              }));
            return { body: { threadId, toolOutputs, frontendTools } };
          }

          return { body: { threadId, message: lastMessage, frontendTools } };
        },
      }),
    [api, threadId, getFrontendTools, isFrontendTool],
  );

  const chat = useChat({
    transport,
    messages: initialMessages,
    onFinish: () => onFinish?.(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const [isResuming, setIsResuming] = useState(false);

  // Transform messages:
  // 1. Merge consecutive assistant messages (follow-ups after tool output continuation)
  // 2. Merge data-tool-suspend parts onto their corresponding tool parts as a `suspend` field
  // 3. Strip resolved data-tool-suspend parts from the output
  const messages = useMemo(() => {
    let result = chat.messages;

    // Merge consecutive assistant messages
    const merged: UIMessage[] = [];
    for (const msg of result) {
      const prev = merged[merged.length - 1];
      if (prev?.role === "assistant" && msg.role === "assistant") {
        merged[merged.length - 1] = {
          ...prev,
          parts: [...prev.parts, ...msg.parts],
        };
      } else {
        merged.push(msg);
      }
    }
    result = merged;

    // Enrich tool parts with suspend data, then strip data-tool-suspend parts
    return result.map((m) => {
      const suspendMap = new Map<string, unknown>();
      for (const p of m.parts) {
        if (p.type === "data-tool-suspend" && !(p as any).data?.resolved) {
          const data = (p as any).data;
          suspendMap.set(data.toolCallId, data);
        }
      }
      if (suspendMap.size === 0) {
        // Still strip resolved data-tool-suspend parts
        const hasDataToolSuspend = m.parts.some(
          (p) => p.type === "data-tool-suspend",
        );
        if (!hasDataToolSuspend) return m;
        return {
          ...m,
          parts: m.parts.filter((p) => p.type !== "data-tool-suspend"),
        };
      }

      const parts = m.parts
        .filter((p) => p.type !== "data-tool-suspend")
        .map((p) => {
          if ("toolCallId" in p) {
            const suspendData = suspendMap.get(
              (p as { toolCallId: string }).toolCallId,
            );
            if (suspendData) {
              return { ...p, suspend: suspendData };
            }
          }
          return p;
        });

      return { ...m, parts };
    });
  }, [chat.messages]);

  const hasSuspendedTools = useMemo(
    () => messages.some((m) => m.parts.some((p) => "suspend" in p)),
    [messages],
  );

  const hasPendingFrontendTools = useMemo(() => {
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg?.role !== "assistant") return false;
    return lastMsg.parts.some((p) => {
      const name = getToolName(p);
      return (
        "toolCallId" in p &&
        name != null &&
        isFrontendTool(name) &&
        (p as any).state === "input-available"
      );
    });
  }, [chat.messages, isFrontendTool]);

  const resumeTool = useCallback(
    async (toolCallId: string, data: unknown) => {
      setIsResuming(true);

      try {
        const frontendTools = getFrontendTools();
        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            resume: { toolCallId, data },
            frontendTools,
          }),
        });

        if (response.status === 204) {
          // More suspensions remain — re-fetch messages from server
          if (fetchMessages) {
            const msgs = await fetchMessages(threadId);
            chat.setMessages(msgs);
          }
          return;
        }

        // All suspensions resolved — LLM follow-up was streamed back.
        // Consume the stream body so the server's onFinish fires and persists the message.
        await response.text();

        // Re-fetch messages from server to get the final state
        if (fetchMessages) {
          const msgs = await fetchMessages(threadId);
          chat.setMessages(msgs);
        }
      } finally {
        setIsResuming(false);
      }
    },
    [chat, api, threadId, fetchMessages, getFrontendTools],
  );

  return {
    rawMessages: chat.messages,
    messages,
    sendMessage:
      hasSuspendedTools || hasPendingFrontendTools
        ? undefined
        : chat.sendMessage,
    status: isResuming ? ("streaming" as const) : chat.status,
    resumeTool,
    addToolOutput: chat.addToolOutput,
    hasSuspendedTools,
    setMessages: chat.setMessages,
  };
}
