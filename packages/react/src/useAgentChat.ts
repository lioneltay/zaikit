import { useChat } from "@ai-sdk/react";
import {
  hasPendingFrontendTools as _hasPendingFrontendTools,
  hasSuspendedTools as _hasSuspendedTools,
  enrichToolPartsWithSuspendData,
  getToolName,
  mergeConsecutiveAssistantMessages,
} from "@zaikit/utils";
import type { UIMessage } from "ai";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useCallback, useMemo, useState } from "react";
import type { FrontendToolRegistration } from "./types";

export type UseAgentChatOptions = {
  api: string;
  threadId: string;
  initialMessages: UIMessage[];
  fetchMessages?: (threadId: string) => Promise<UIMessage[]>;
  onFinish?: () => void;
  body?: Record<string, unknown>;
  getFrontendTools: () => FrontendToolRegistration[];
  isFrontendTool: (name: string) => boolean;
};

export function buildSendBody(
  messages: UIMessage[],
  opts: {
    extraBody?: Record<string, unknown>;
    threadId: string;
    getFrontendTools: () => FrontendToolRegistration[];
    isFrontendTool: (name: string) => boolean;
  },
): { body: Record<string, unknown> } {
  const lastMessage = messages[messages.length - 1];
  const frontendTools = opts.getFrontendTools();

  if (lastMessage.role === "assistant") {
    const toolOutputs = lastMessage.parts
      .filter((p) => {
        const name = getToolName(p);
        return (
          "toolCallId" in p &&
          name != null &&
          opts.isFrontendTool(name) &&
          (p as any).state === "output-available"
        );
      })
      .map((p) => ({
        toolCallId: (p as any).toolCallId,
        output: (p as any).output,
      }));
    return {
      body: {
        ...opts.extraBody,
        threadId: opts.threadId,
        toolOutputs,
        frontendTools,
      },
    };
  }

  return {
    body: {
      ...opts.extraBody,
      threadId: opts.threadId,
      message: lastMessage,
      frontendTools,
    },
  };
}

export function useAgentChat({
  api,
  threadId,
  initialMessages,
  fetchMessages,
  onFinish,
  body: extraBody,
  getFrontendTools,
  isFrontendTool,
}: UseAgentChatOptions) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api,
        prepareSendMessagesRequest: ({ messages }) =>
          buildSendBody(messages, {
            extraBody,
            threadId,
            getFrontendTools,
            isFrontendTool,
          }),
      }),
    [api, threadId, extraBody, getFrontendTools, isFrontendTool],
  );

  const chat = useChat({
    transport,
    messages: initialMessages,
    onFinish: () => onFinish?.(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const [isResuming, setIsResuming] = useState(false);

  const messages = useMemo(() => {
    return enrichToolPartsWithSuspendData(
      mergeConsecutiveAssistantMessages(chat.messages),
    );
  }, [chat.messages]);

  const hasSuspendedTools = useMemo(
    () => _hasSuspendedTools(messages),
    [messages],
  );

  const hasPendingFrontendTools = useMemo(
    () => _hasPendingFrontendTools(chat.messages, isFrontendTool),
    [chat.messages, isFrontendTool],
  );

  const resumeTool = useCallback(
    async (toolCallId: string, data: unknown) => {
      setIsResuming(true);

      try {
        const frontendTools = getFrontendTools();
        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...extraBody,
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
    [chat, api, threadId, extraBody, fetchMessages, getFrontendTools],
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
