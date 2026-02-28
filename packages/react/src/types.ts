import type React from "react";
import type { UIMessage } from "ai";

export type ToolRenderState = "call" | "suspended" | "result";

export type ToolRenderProps = {
  toolCallId: string;
  toolName: string;
  state: ToolRenderState;
  args: Record<string, unknown>;
  suspendPayload: unknown | undefined;
  result: unknown | undefined;
  resume: (data: unknown) => void;
};

export type ToolRenderFn = (props: ToolRenderProps) => React.ReactNode;

export type AgentContextValue = {
  messages: UIMessage[];
  rawMessages: UIMessage[];
  status: string;
  sendMessage: ((opts: { text: string }) => void) | undefined;
  resumeTool: (toolCallId: string, data: unknown) => void;
  hasSuspendedTools: boolean;
  setMessages: (msgs: UIMessage[]) => void;
  renderToolPart: (part: unknown) => React.ReactNode | null;
  registerToolRenderer: (entry: {
    toolName: string;
    render: ToolRenderFn;
  }) => () => void;
};
