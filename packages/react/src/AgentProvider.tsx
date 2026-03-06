import { getToolName } from "@zaikit/utils";
import type { UIMessage } from "ai";
import type React from "react";
import { createContext, useCallback, useMemo, useRef, useState } from "react";
import type {
  AgentContextValue,
  FrontendToolRegistration,
  ToolRenderFn,
  ToolRenderProps,
  ToolRenderState,
} from "./types";
import { useAgentChat } from "./useAgentChat";

export const AgentContext = createContext<AgentContextValue | null>(null);

type AgentProviderProps = {
  api: string;
  threadId: string;
  initialMessages: UIMessage[];
  fetchMessages?: (threadId: string) => Promise<UIMessage[]>;
  onFinish?: () => void;
  body?: Record<string, unknown>;
  children: React.ReactNode;
};

export function AgentProvider({
  children,
  ...chatOptions
}: AgentProviderProps) {
  const frontendToolsRef = useRef(new Map<string, FrontendToolRegistration>());

  const getFrontendTools = useCallback(
    () => Array.from(frontendToolsRef.current.values()),
    [],
  );
  const isFrontendTool = useCallback(
    (name: string) => frontendToolsRef.current.has(name),
    [],
  );

  const chat = useAgentChat({
    ...chatOptions,
    getFrontendTools,
    isFrontendTool,
  });

  const registryRef = useRef(new Map<string, { render: ToolRenderFn }>());
  const [, setRegistryVersion] = useState(0);

  const registerToolRenderer = useCallback(
    (entry: { toolName: string; render: ToolRenderFn }) => {
      registryRef.current.set(entry.toolName, {
        render: entry.render,
      });
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

      const toolName = getToolName(p) ?? "";

      const entry =
        registryRef.current.get(toolName) ?? registryRef.current.get("*");
      if (!entry) return null;
      const renderer = entry.render;

      const suspend = p.suspend as
        | { payload?: unknown; toolCallId?: string }
        | undefined;

      let state: ToolRenderState;
      if (suspend) {
        state = "suspended";
      } else if ((p.state as string) === "output-available") {
        state = "result";
      } else if ((p.state as string) === "output-error") {
        state = "error";
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
        result: (p.output ?? p.result) as unknown,
        error:
          state === "error"
            ? ((p.errorText as string) ?? "Unknown error")
            : undefined,
        data: (p.data as ToolRenderProps["data"]) ?? [],
        resume: (data: unknown) => {
          if (frontendToolsRef.current.has(toolName)) {
            chat.addToolOutput({ tool: toolName, toolCallId, output: data });
          } else if (state !== "result" && state !== "error") {
            chat.resumeTool(toolCallId, data);
          }
        },
      };

      return renderer(props);
    },
    [chat.resumeTool, chat.addToolOutput],
  );

  const getRegisteredRenderers = useCallback(
    () =>
      Array.from(registryRef.current.entries()).map(([name, entry]) => ({
        name,
        render: entry.render,
      })),
    [],
  );

  const registerFrontendTool = useCallback((tool: FrontendToolRegistration) => {
    frontendToolsRef.current.set(tool.name, tool);
    return () => {
      frontendToolsRef.current.delete(tool.name);
    };
  }, []);

  const value: AgentContextValue = useMemo(
    () => ({
      messages: chat.messages,
      rawMessages: chat.rawMessages,
      status: chat.status,
      sendMessage: chat.sendMessage,
      resumeTool: chat.resumeTool,
      addToolOutput: chat.addToolOutput,
      hasSuspendedTools: chat.hasSuspendedTools,
      setMessages: chat.setMessages,
      renderToolPart,
      registerToolRenderer,
      registerFrontendTool,
      getRegisteredRenderers,
    }),
    [
      chat.messages,
      chat.rawMessages,
      chat.status,
      chat.sendMessage,
      chat.resumeTool,
      chat.addToolOutput,
      chat.hasSuspendedTools,
      chat.setMessages,
      renderToolPart,
      registerToolRenderer,
      registerFrontendTool,
      getRegisteredRenderers,
    ],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}
