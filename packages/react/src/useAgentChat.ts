import { useChat } from "@ai-sdk/react";
import {
  hasPendingFrontendTools as _hasPendingFrontendTools,
  hasSuspendedTools as _hasSuspendedTools,
  getToolName,
  processMessages,
} from "@zaikit/utils";
import type { UIMessage } from "ai";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useMemo, useRef } from "react";
import { AgentChatTransport } from "./agent-chat-transport";
import type { FrontendToolRegistration } from "./types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseAgentChatOptions = {
  api: string;
  threadId: string;
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
  onFinish,
  body: extraBody,
  getFrontendTools,
  isFrontendTool,
}: UseAgentChatOptions) {
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const transport = useMemo(
    () =>
      new AgentChatTransport({
        api,
        prepareSendMessagesRequest: ({ messages }) =>
          buildSendBody(messages, {
            extraBody,
            threadId: threadIdRef.current,
            getFrontendTools,
            isFrontendTool,
          }),
      }),
    [api, extraBody, getFrontendTools, isFrontendTool],
  );

  const chat = useChat({
    id: threadId,
    transport,
    onFinish: () => onFinish?.(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const messages = useMemo(
    () => processMessages(chat.messages),
    [chat.messages],
  );

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
      const frontendTools = getFrontendTools();
      await chat.resumeStream({
        body: {
          ...extraBody,
          threadId: threadIdRef.current,
          resume: { toolCallId, data },
          frontendTools,
        },
      });
    },
    [chat, extraBody, getFrontendTools],
  );

  return {
    rawMessages: chat.messages,
    messages,
    sendMessage:
      hasSuspendedTools || hasPendingFrontendTools
        ? undefined
        : chat.sendMessage,
    status: chat.status,
    resumeTool,
    addToolOutput: chat.addToolOutput,
    hasSuspendedTools,
    setMessages: chat.setMessages,
  };
}
