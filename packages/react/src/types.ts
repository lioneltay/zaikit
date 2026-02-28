import type React from "react";
import type { UIMessage } from "ai";

export type ToolRenderState = "call" | "suspended" | "result";

export type ToolRenderProps<
  TArgs = Record<string, unknown>,
  TSuspend = unknown,
  TResume = unknown,
> = {
  toolCallId: string;
  toolName: string;
  state: ToolRenderState;
  args: TArgs;
  suspendPayload: TSuspend | undefined;
  result: unknown;
  resume: (data: TResume) => void;
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
