import type { ToolDataPart } from "@zaikit/utils";
import type { UIMessage } from "ai";
import type React from "react";

export type ToolRenderState = "call" | "suspended" | "result" | "error";

/** Typed view of tool data parts grouped by type key. Partial because keys are only populated when data arrives. */
export type TypedToolData<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [K in keyof T]?: Array<{ id: string; data: T[K] }>;
};

export type ToolRenderProps<
  TArgs = Record<string, unknown>,
  TSuspend = unknown,
  TResume = unknown,
  TData extends Record<string, unknown> = Record<string, unknown>,
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
  toolData: TypedToolData<TData>;
};

export type ToolRenderFn = (props: ToolRenderProps) => React.ReactNode;

export type FrontendToolRegistration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentContextValue = {
  threadId: string;
  setThreadId: (id: string) => void;
  createNewThread: () => string;
  loadOlderMessages: () => Promise<void>;
  isLoadingMessages: boolean;
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
