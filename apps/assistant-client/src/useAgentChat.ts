import { useState, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { trpc } from "./trpc";

type UseAgentChatOptions = {
  threadId: string;
  initialMessages: UIMessage[];
  onFinish?: () => void;
};

export function useAgentChat({
  threadId,
  initialMessages,
  onFinish,
}: UseAgentChatOptions) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "http://localhost:7301/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          return { body: { threadId, message: lastMessage } };
        },
      }),
    [threadId],
  );

  const chat = useChat({
    transport,
    messages: initialMessages,
    onFinish: () => onFinish?.(),
  });

  const [resumedMessageId, setResumedMessageId] = useState<string | null>(
    null,
  );
  const [isResuming, setIsResuming] = useState(false);

  // Transform messages:
  // 1. Join follow-up into original message by ID
  // 2. Merge data-tool-suspend parts onto their corresponding tool parts as a `suspend` field
  // 3. Strip data-tool-suspend parts from the output
  const messages = useMemo(() => {
    let result = chat.messages;

    // Join by ID: merge follow-up message into the resumed message
    if (resumedMessageId) {
      const merged: UIMessage[] = [];
      let targetIdx = -1;

      for (const msg of result) {
        if (msg.id === resumedMessageId) {
          targetIdx = merged.length;
          merged.push(msg);
        } else if (
          targetIdx >= 0 &&
          msg.role === "assistant" &&
          merged[targetIdx].id === resumedMessageId
        ) {
          // Follow-up — merge parts into the target
          merged[targetIdx] = {
            ...merged[targetIdx],
            parts: [...merged[targetIdx].parts, ...msg.parts],
          };
        } else {
          merged.push(msg);
        }
      }
      result = merged;
    }

    // Enrich tool parts with suspend data, then strip data-tool-suspend parts
    return result.map((m) => {
      const suspendMap = new Map<string, unknown>();
      for (const p of m.parts) {
        if (p.type === "data-tool-suspend") {
          const data = (p as any).data;
          suspendMap.set(data.toolCallId, data);
        }
      }
      if (suspendMap.size === 0) return m;

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
  }, [chat.messages, resumedMessageId]);

  const hasSuspendedTools = useMemo(
    () =>
      messages.some((m) =>
        m.parts.some(
          (p) =>
            "suspend" in p &&
            (p as { state: string }).state !== "output-available",
        ),
      ),
    [messages],
  );

  const resumeTool = useCallback(
    async (toolCallId: string, data: unknown) => {
      // Track which message we're resuming (for merging)
      const suspendedMsg = chat.messages.find((m) =>
        m.parts.some(
          (p) =>
            p.type === "data-tool-suspend" &&
            (p as { data: { toolCallId: string } }).data.toolCallId ===
              toolCallId,
        ),
      );
      setResumedMessageId(suspendedMsg?.id ?? null);
      setIsResuming(true);

      try {
        const response = await fetch("http://localhost:7301/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            resume: { toolCallId, data },
          }),
        });

        if (response.status === 204) {
          // More suspensions remain — re-fetch messages from server
          const msgs = await trpc.thread.getMessages.query({ threadId });
          chat.setMessages(msgs as unknown as UIMessage[]);
          setResumedMessageId(null);
          return;
        }

        // All suspensions resolved — LLM follow-up was streamed back.
        // Consume the stream body so the server's onFinish fires and persists the message.
        await response.text();

        // Re-fetch messages from server to get the final state
        const msgs = await trpc.thread.getMessages.query({ threadId });
        chat.setMessages(msgs as unknown as UIMessage[]);
        setResumedMessageId(null);
      } finally {
        setIsResuming(false);
      }
    },
    [chat, threadId],
  );

  return {
    rawMessages: chat.messages,
    messages,
    sendMessage: hasSuspendedTools ? undefined : chat.sendMessage,
    status: isResuming ? ("streaming" as const) : chat.status,
    resumeTool,
    hasSuspendedTools,
    setMessages: chat.setMessages,
  };
}
