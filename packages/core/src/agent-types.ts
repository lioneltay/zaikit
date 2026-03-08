import type { Memory } from "@zaikit/memory";
import type {
  LanguageModel,
  LanguageModelUsage,
  ModelMessage,
  PrepareStepResult,
  StepResult,
  TelemetrySettings,
  Tool,
  ToolSet,
  UIMessage,
} from "ai";
import type { z } from "zod";
import type { Middleware } from "./middleware/core";
import type { ToolDataEvent, WriteDataPart } from "./write-data";

// --- Data callbacks ---

/** Callbacks for observing data/metadata events. Used at both agent and per-request level. */
export type DataCallbacks<T extends ToolSet = ToolSet> = {
  onData?: (part: WriteDataPart) => void;
  onToolData?: (event: ToolDataEventFor<T>) => void;
  onMetadata?: (metadata: Record<string, unknown>) => void;
};

// --- Typed tool data event ---

/**
 * Derives a discriminated union of tool data events from a ToolSet.
 * Each member is discriminated first by `toolName`, then by `type`,
 * narrowing `data` to the exact schema type.
 *
 * For tools without `dataSchema` (DATA = never), no members are produced.
 * Falls back to the untyped `ToolDataEvent` when no tools have data schemas.
 */
export type ToolDataEventFor<T extends ToolSet> = {
  [Name in keyof T & string]: T[Name] extends {
    __toolTypes: { data: infer D };
  }
    ? [D] extends [never]
      ? never
      : {
          [K in keyof D & string]: {
            toolName: Name;
            toolCallId: string;
            type: K;
            data: D[K];
            id: string;
            transient?: boolean;
          };
        }[keyof D & string]
    : never;
}[keyof T & string] extends infer U
  ? [U] extends [never]
    ? ToolDataEvent
    : U
  : ToolDataEvent;

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
  /** Agent name. Used as the default `functionId` for telemetry. */
  name?: string;
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

  /**
   * Enable AI SDK telemetry. Pass `true` to enable with defaults (uses
   * agent `name` as `functionId`), or pass a `TelemetrySettings` object
   * for full control.
   *
   * Requires OpenTelemetry to be set up in the host application.
   * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry
   */
  telemetry?: boolean | TelemetrySettings;
} & DataCallbacks;

// --- Frontend tool types ---

export type FrontendToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// --- ChatOptions ---

export type ChatOptions<C = undefined, T extends ToolSet = ToolSet> = ([
  C,
] extends [undefined]
  ? { context?: never }
  : { context: C }) &
  DataCallbacks<T> & {
    threadId: string;
    /** User ID. Auto-injected as `metadata.userId` into telemetry when present. */
    userId?: string;
    frontendTools?: FrontendToolDef[];
    /** Per-request telemetry override. `true`/`false` to enable/disable, or an object to merge with agent defaults. */
    telemetry?: boolean | Partial<TelemetrySettings>;
  } & (
    | { message: UIMessage }
    | { resume: { toolCallId: string; data: unknown } }
    | { toolOutputs: { toolCallId: string; output: unknown }[] }
  );

// --- Stream / Generate types ---

export type AgentResult = {
  text: string;
  output: unknown;
  steps: StepResult<ToolSet>[];
  finishReason: string;
  usage: LanguageModelUsage;
};

export type StreamOptions<C = undefined, T extends ToolSet = ToolSet> = ([
  C,
] extends [undefined]
  ? { context?: never }
  : { context: C }) &
  DataCallbacks<T> & {
    messages: UIMessage[];
    model?: LanguageModel;
    threadId?: string;
    /** User ID. Auto-injected as `metadata.userId` into telemetry when present. */
    userId?: string;
    maxSteps?: number;
    output?: z.ZodType;
    frontendTools?: FrontendToolDef[];
    /** Per-request telemetry override. `true`/`false` to enable/disable, or an object to merge with agent defaults. */
    telemetry?: boolean | Partial<TelemetrySettings>;
  };

export type StreamResult = {
  stream: ReadableStream<unknown>;
  result: Promise<AgentResult>;
};

export type BaseGenerateOptions<C = undefined, T extends ToolSet = ToolSet> = ([
  C,
] extends [undefined]
  ? { context?: never }
  : { context: C }) &
  DataCallbacks<T> & {
    model?: LanguageModel;
    /** User ID. Auto-injected as `metadata.userId` into telemetry when present. */
    userId?: string;
    maxSteps?: number;
    frontendTools?: FrontendToolDef[];
    /** Per-request telemetry override. `true`/`false` to enable/disable, or an object to merge with agent defaults. */
    telemetry?: boolean | Partial<TelemetrySettings>;
  } & ({ prompt: string } | { messages: UIMessage[] });

export type GenerateOptions<
  C = undefined,
  T extends ToolSet = ToolSet,
> = BaseGenerateOptions<C, T> & {
  output?: z.ZodType;
};

export type GenerateResult<OUTPUT extends z.ZodType = never> = AgentResult & {
  output: [OUTPUT] extends [never] ? undefined : z.infer<OUTPUT>;
};

// --- Agent type ---

export type Agent<T extends ToolSet = ToolSet, C = undefined> = {
  name: string | undefined;
  tools: T;
  memory: Memory | undefined;
  model: LanguageModel;
  system: string | ((context: C) => string | Promise<string>) | undefined;
  contextSchema: Record<string, unknown> | undefined;
  stream(options: StreamOptions<C, T>): Promise<StreamResult>;
  chat(options: ChatOptions<C, T>): Promise<Response>;
  generate<OUTPUT extends z.ZodType = never>(
    options: BaseGenerateOptions<C, T> & { output?: OUTPUT },
  ): Promise<GenerateResult<OUTPUT>>;
};
