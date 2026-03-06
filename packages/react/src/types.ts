import type { ToolDataPart } from "@zaikit/utils";
import type { UIMessage } from "ai";
import type React from "react";

export type ToolRenderState = "call" | "suspended" | "result" | "error";

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
  error: string | undefined;
  resume: (data: TResume) => void;
  data: ToolDataPart[];
};

export type ToolRenderFn = (props: ToolRenderProps) => React.ReactNode;

export type FrontendToolRegistration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentContextValue = {
  messages: UIMessage[];
  rawMessages: UIMessage[];
  status: string;
  sendMessage: ((opts: { text: string }) => void) | undefined;
  resumeTool: (toolCallId: string, data: unknown) => void;
  addToolOutput: (opts: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => Promise<void>;
  hasSuspendedTools: boolean;
  setMessages: (msgs: UIMessage[]) => void;
  renderToolPart: (part: unknown) => React.ReactNode | null;
  registerToolRenderer: (entry: {
    toolName: string;
    render: ToolRenderFn;
  }) => () => void;
  registerFrontendTool: (tool: FrontendToolRegistration) => () => void;
  getRegisteredRenderers: () => Array<{ name: string; render: ToolRenderFn }>;
};
