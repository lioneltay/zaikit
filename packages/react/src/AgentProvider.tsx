import React, {
  createContext,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { UIMessage } from "ai";
import { useAgentChat, type UseAgentChatOptions } from "./useAgentChat.js";
import type {
  AgentContextValue,
  ToolRenderFn,
  ToolRenderProps,
  ToolRenderState,
} from "./types.js";

export const AgentContext = createContext<AgentContextValue | null>(null);

type AgentProviderProps = UseAgentChatOptions & {
  children: React.ReactNode;
};

export function AgentProvider({ children, ...chatOptions }: AgentProviderProps) {
  const chat = useAgentChat(chatOptions);

  const registryRef = useRef(new Map<string, ToolRenderFn>());
  const [, setRegistryVersion] = useState(0);

  const registerToolRenderer = useCallback(
    (entry: { toolName: string; render: ToolRenderFn }) => {
      registryRef.current.set(entry.toolName, entry.render);
      setRegistryVersion((v) => v + 1);
      return () => {
        registryRef.current.delete(entry.toolName);
        setRegistryVersion((v) => v + 1);
      };
    },
    [],
  );

  const renderToolPart = useCallback(
    (part: unknown): React.ReactNode | null => {
      const p = part as Record<string, unknown>;
      const toolCallId = (p.toolCallId as string) ?? "";

      // toolName can live at p.toolName, inside p.suspend.toolName,
      // or encoded in the part type as "tool-<name>"
      const toolName =
        (p.toolName as string) ??
        ((p.suspend as Record<string, unknown> | undefined)
          ?.toolName as string) ??
        ((p.type as string)?.startsWith("tool-")
          ? (p.type as string).slice(5)
          : "") ??
        "";

      const renderer =
        registryRef.current.get(toolName) ?? registryRef.current.get("*");
      if (!renderer) return null;

      const suspend = p.suspend as
        | { payload?: unknown; toolCallId?: string }
        | undefined;

      let state: ToolRenderState;
      if ((p.state as string) === "output-available") {
        state = "result";
      } else if (suspend) {
        state = "suspended";
      } else {
        state = "call";
      }

      const props: ToolRenderProps = {
        toolCallId,
        toolName,
        state,
        args: ((p.args ?? p.input) as Record<string, unknown>) ?? {},
        suspendPayload: suspend
          ? (suspend as Record<string, unknown>).payload
          : undefined,
        result: p.result as unknown,
        resume: (data: unknown) => {
          if (state !== "result") {
            chat.resumeTool(toolCallId, data);
          }
        },
      };

      return renderer(props);
    },
    [chat.resumeTool],
  );

  const value: AgentContextValue = useMemo(
    () => ({
      messages: chat.messages,
      rawMessages: chat.rawMessages,
      status: chat.status,
      sendMessage: chat.sendMessage,
      resumeTool: chat.resumeTool,
      hasSuspendedTools: chat.hasSuspendedTools,
      setMessages: chat.setMessages,
      renderToolPart,
      registerToolRenderer,
    }),
    [
      chat.messages,
      chat.rawMessages,
      chat.status,
      chat.sendMessage,
      chat.resumeTool,
      chat.hasSuspendedTools,
      chat.setMessages,
      renderToolPart,
      registerToolRenderer,
    ],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}
