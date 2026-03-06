import type { Memory } from "@zaikit/memory";
import type {
  LanguageModel,
  LanguageModelUsage,
  ModelMessage,
  PrepareStepResult,
  StepResult,
  Tool,
  ToolSet,
  UIMessage,
} from "ai";
import type { z } from "zod";
import type { Middleware } from "./middleware/core";

// --- Hook context types ---

export type AfterStepContext = {
  /** The step that just completed. */
  step: StepResult<ToolSet>;
  /** All steps completed so far, including this one. */
  steps: StepResult<ToolSet>[];
};

export type BeforeToolCallContext = {
  toolName: string;
  toolCallId: string;
  input: unknown;
};

export type AfterToolCallContext = {
  toolName: string;
  toolCallId: string;
  input: unknown;
  output: unknown;
};

// --- Tool config types ---

export type MappedToolEntry<C> = {
  tool: Tool<any, any>;
  mapContext: (ctx: C) => unknown;
};

export type ToolConfigValue<C = undefined> = [C] extends [undefined]
  ? Tool<any, any>
  : Tool<any, any> | MappedToolEntry<C>;

export type ResolveToolEntry<E> = E extends {
  tool: infer T extends Tool<any, any>;
}
  ? T
  : E;

export type ResolveToolsConfig<T> = {
  [K in keyof T]: ResolveToolEntry<T[K]>;
};

export type ValidateMappedTools<T, C> = {
  [K in keyof T]: T[K] extends {
    tool: { readonly __toolTypes: { readonly context: infer TC } };
    mapContext: any;
  }
    ? {
        tool: T[K] extends { tool: infer U } ? U : never;
        mapContext: (ctx: C) => TC;
      }
    : T[K];
};

// --- PrepareStep ---

export type PrepareStep<
  TOOLS extends ToolSet = ToolSet,
  C = undefined,
> = (options: {
  steps: StepResult<ToolSet>[];
  stepNumber: number;
  model: LanguageModel;
  messages: ModelMessage[];
  context: C;
}) =>
  | PrepareStepResult<NoInfer<TOOLS>>
  | PromiseLike<PrepareStepResult<NoInfer<TOOLS>>>;

// --- CreateAgentOptions ---

export type CreateAgentOptions<
  T extends Record<string, ToolConfigValue<C>> = ToolSet,
  C = undefined,
> = ([C] extends [undefined]
  ? { context?: never }
  : { context: z.ZodType<C> }) & {
  model: LanguageModel;
  system?: string | ((context: C) => string | Promise<string>);
  tools?: T & ValidateMappedTools<T, C>;
  memory?: Memory;
  middleware?: Middleware[];
  prepareStep?: PrepareStep<ResolveToolsConfig<T> & ToolSet, C>;
  onAfterStep?: (ctx: AfterStepContext) => Promise<void> | void;
  onBeforeToolCall?: (
    ctx: BeforeToolCallContext,
  ) =>
    | Promise<{ input?: unknown } | undefined>
    | { input?: unknown }
    | undefined;
  onAfterToolCall?: (
    ctx: AfterToolCallContext,
  ) =>
    | Promise<{ output?: unknown } | undefined>
    | { output?: unknown }
    | undefined;
};

// --- Frontend tool types ---

export type FrontendToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// --- ChatOptions ---

export type ChatOptions<C = undefined> = ([C] extends [undefined]
  ? { context?: never }
  : { context: C }) &
  (
    | {
        threadId: string;
        message: UIMessage;
        ownerId?: string;
        frontendTools?: FrontendToolDef[];
      }
    | {
        threadId: string;
        resume: { toolCallId: string; data: unknown };
        frontendTools?: FrontendToolDef[];
      }
    | {
        threadId: string;
        toolOutputs: { toolCallId: string; output: unknown }[];
        frontendTools?: FrontendToolDef[];
      }
  );

// --- Stream / Generate types ---

export type AgentResult = {
  text: string;
  output: unknown;
  steps: StepResult<ToolSet>[];
  finishReason: string;
  usage: LanguageModelUsage;
};

export type StreamOptions<C = undefined> = ([C] extends [undefined]
  ? { context?: never }
  : { context: C }) & {
  messages: UIMessage[];
  model?: LanguageModel;
  threadId?: string;
  maxSteps?: number;
  output?: z.ZodType;
  frontendTools?: FrontendToolDef[];
};

export type StreamResult = {
  stream: ReadableStream<unknown>;
  result: Promise<AgentResult>;
};

export type BaseGenerateOptions<C = undefined> = ([C] extends [undefined]
  ? { context?: never }
  : { context: C }) & {
  model?: LanguageModel;
  maxSteps?: number;
  frontendTools?: FrontendToolDef[];
} & ({ prompt: string } | { messages: UIMessage[] });

export type GenerateOptions<C = undefined> = BaseGenerateOptions<C> & {
  output?: z.ZodType;
};

export type GenerateResult<OUTPUT extends z.ZodType = never> = AgentResult & {
  output: [OUTPUT] extends [never] ? undefined : z.infer<OUTPUT>;
};

// --- Agent type ---

export type Agent<T extends ToolSet = ToolSet, C = undefined> = {
  tools: T;
  memory: Memory | undefined;
  model: LanguageModel;
  system: string | ((context: C) => string | Promise<string>) | undefined;
  contextSchema: Record<string, unknown> | undefined;
  stream(options: StreamOptions<C>): Promise<StreamResult>;
  chat(options: ChatOptions<C>): Promise<Response>;
  generate<OUTPUT extends z.ZodType = never>(
    options: BaseGenerateOptions<C> & { output?: OUTPUT },
  ): Promise<GenerateResult<OUTPUT>>;
};
