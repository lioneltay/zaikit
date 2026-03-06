import { DATA_TOOL_SUSPEND } from "@zaikit/utils";
import { type Tool, tool } from "ai";
import { toJSONSchema, type z } from "zod";
import {
  isSuspendResult,
  type SuspendResult,
  suspend as suspendFn,
} from "./suspend";
import { getToolInjection } from "./tool-injection";
import type {
  InternalWriteDataFn,
  WriteDataFn,
  WriteToolDataFn,
} from "./write-data";

export type ToolMeta = {
  suspendSchema?: Record<string, unknown>;
  resumeSchema?: Record<string, unknown>;
  contextSchema?: z.ZodType;
};

// Enriched tool type that preserves all type parameters for codegen.
// Extends the AI SDK's Tool so it satisfies ToolSet everywhere.
// The __toolTypes property is a phantom brand — it exists only in the
// type system for codegen to read. No runtime cost.
export type ZaikitTool<
  INPUT = any,
  OUTPUT = any,
  SUSPEND = never,
  RESUME = never,
  CONTEXT = undefined,
  DATA = never,
> = Tool<INPUT, OUTPUT> & {
  readonly __toolTypes: {
    readonly input: INPUT;
    readonly output: Exclude<OUTPUT, SuspendResult<any>>;
    readonly suspend: SUSPEND;
    readonly resume: RESUME;
    readonly context: CONTEXT;
    readonly data: DATA;
  };
  readonly __meta?: ToolMeta;
};

// Base options shared by both overloads
type BaseToolOptions<INPUT> = {
  description: string;
  inputSchema: z.ZodType<INPUT>;
};

// Base execute context shared by all tool variants
type BaseExecuteContext<INPUT> = {
  input: INPUT;
  writeData: WriteDataFn;
};

// Conditionally add writeToolData when DATA is present.
// The `& Record<string, unknown>` satisfies WriteToolDataFn's constraint;
// in practice DATA is always constrained by the overloads.
type DataExecuteContext<DATA> = [DATA] extends [never]
  ? {}
  : { writeToolData: WriteToolDataFn<DATA & Record<string, unknown>> };

// Conditionally require dataSchema when DATA is present
type DataSchemaOption<DATA> = [DATA] extends [never]
  ? { dataSchema?: never }
  : { dataSchema: { [K in keyof DATA]: z.ZodType<DATA[K]> } };

// Regular tool options (no suspend/resume)

type RegularToolOptions<
  INPUT,
  OUTPUT,
  CONTEXT = undefined,
  DATA = never,
> = BaseToolOptions<INPUT> &
  DataSchemaOption<DATA> &
  ([CONTEXT] extends [undefined]
    ? {
        context?: never;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema?: never;
        resumeSchema?: never;
        execute: (
          ctx: BaseExecuteContext<INPUT> & DataExecuteContext<DATA>,
        ) => Promise<OUTPUT>;
      }
    : {
        context: z.ZodType<CONTEXT>;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema?: never;
        resumeSchema?: never;
        execute: (
          ctx: BaseExecuteContext<INPUT> &
            DataExecuteContext<DATA> & { context: CONTEXT },
        ) => Promise<OUTPUT>;
      });

// Suspendable tool options (with suspend/resume schemas)
type SuspendableToolOptions<
  INPUT,
  OUTPUT,
  SUSPEND,
  RESUME,
  CONTEXT = undefined,
  DATA = never,
> = BaseToolOptions<INPUT> &
  DataSchemaOption<DATA> &
  ([CONTEXT] extends [undefined]
    ? {
        context?: never;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema: z.ZodType<SUSPEND>;
        resumeSchema: z.ZodType<RESUME>;
        execute: (
          ctx: BaseExecuteContext<INPUT> &
            DataExecuteContext<DATA> & {
              suspend: (data: SUSPEND) => SuspendResult<SUSPEND>;
              resumeData: RESUME | undefined;
              resumeHistory: RESUME[];
            },
        ) => Promise<OUTPUT | SuspendResult<SUSPEND>>;
      }
    : {
        context: z.ZodType<CONTEXT>;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema: z.ZodType<SUSPEND>;
        resumeSchema: z.ZodType<RESUME>;
        execute: (
          ctx: BaseExecuteContext<INPUT> &
            DataExecuteContext<DATA> & {
              context: CONTEXT;
              suspend: (data: SUSPEND) => SuspendResult<SUSPEND>;
              resumeData: RESUME | undefined;
              resumeHistory: RESUME[];
            },
        ) => Promise<OUTPUT | SuspendResult<SUSPEND>>;
      });

// Overload: regular tool without context
export function createTool<INPUT, OUTPUT>(
  options: RegularToolOptions<INPUT, OUTPUT>,
): ZaikitTool<INPUT, OUTPUT>;

// Overload: regular tool with context
export function createTool<INPUT, OUTPUT, CONTEXT>(
  options: RegularToolOptions<INPUT, OUTPUT, CONTEXT>,
): ZaikitTool<INPUT, OUTPUT, never, never, CONTEXT>;

// Overload: regular tool with data (no context)
export function createTool<INPUT, OUTPUT, DATA extends Record<string, unknown>>(
  options: RegularToolOptions<INPUT, OUTPUT, undefined, DATA>,
): ZaikitTool<INPUT, OUTPUT, never, never, undefined, DATA>;

// Overload: regular tool with data and context
export function createTool<
  INPUT,
  OUTPUT,
  CONTEXT,
  DATA extends Record<string, unknown>,
>(
  options: RegularToolOptions<INPUT, OUTPUT, CONTEXT, DATA>,
): ZaikitTool<INPUT, OUTPUT, never, never, CONTEXT, DATA>;

// Overload: suspendable tool without context
export function createTool<INPUT, OUTPUT, SUSPEND, RESUME>(
  options: SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME>,
): ZaikitTool<INPUT, OUTPUT | SuspendResult<SUSPEND>, SUSPEND, RESUME>;

// Overload: suspendable tool with context
export function createTool<INPUT, OUTPUT, SUSPEND, RESUME, CONTEXT>(
  options: SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME, CONTEXT>,
): ZaikitTool<INPUT, OUTPUT | SuspendResult<SUSPEND>, SUSPEND, RESUME, CONTEXT>;

// Overload: suspendable tool with data (no context)
export function createTool<
  INPUT,
  OUTPUT,
  SUSPEND,
  RESUME,
  DATA extends Record<string, unknown>,
>(
  options: SuspendableToolOptions<
    INPUT,
    OUTPUT,
    SUSPEND,
    RESUME,
    undefined,
    DATA
  >,
): ZaikitTool<
  INPUT,
  OUTPUT | SuspendResult<SUSPEND>,
  SUSPEND,
  RESUME,
  undefined,
  DATA
>;

// Overload: suspendable tool with data and context
export function createTool<
  INPUT,
  OUTPUT,
  SUSPEND,
  RESUME,
  CONTEXT,
  DATA extends Record<string, unknown>,
>(
  options: SuspendableToolOptions<
    INPUT,
    OUTPUT,
    SUSPEND,
    RESUME,
    CONTEXT,
    DATA
  >,
): ZaikitTool<
  INPUT,
  OUTPUT | SuspendResult<SUSPEND>,
  SUSPEND,
  RESUME,
  CONTEXT,
  DATA
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTool(options: any): ZaikitTool<any, any> {
  const { description, inputSchema, outputSchema, execute } = options;

  const isSuspendable = options.suspendSchema && options.resumeSchema;
  const hasContext = !!options.context;
  const dataSchemas: Record<string, z.ZodType> | undefined = options.dataSchema;

  // Validate dataSchema keys
  if (dataSchemas) {
    for (const key of Object.keys(dataSchemas)) {
      // Keys starting with "data-" would be double-prefixed or skip prefixing,
      // causing a mismatch between backend type and frontend toolData key.
      if (key.startsWith("data-")) {
        throw new Error(
          `dataSchema key "${key}" must not start with "data-" (the prefix is added automatically on the wire).`,
        );
      }
      const wireType = `data-${key}`;
      if (wireType === DATA_TOOL_SUSPEND) {
        throw new Error(
          `dataSchema key "${key}" produces reserved wire type "${wireType}". Choose a different key.`,
        );
      }
    }
  }

  const meta: ToolMeta = {
    ...(isSuspendable && {
      suspendSchema: toJSONSchema(options.suspendSchema),
      resumeSchema: toJSONSchema(options.resumeSchema),
    }),
    ...(hasContext && {
      contextSchema: options.context,
    }),
  };

  const t = tool({
    description,
    inputSchema,
    execute: async (input, { toolCallId }) => {
      const injection = getToolInjection();
      const rawWriteData: InternalWriteDataFn =
        injection.writeData ?? (() => {});
      const toolName = injection.toolName;

      // writeData always emits message-scoped parts (no tool association).
      // For tool-scoped data, use writeToolData (typed, requires dataSchema).
      const writeData: WriteDataFn = (part) => rawWriteData(part);
      const ctx: Record<string, unknown> = { input, writeData };

      // Build writeToolData when dataSchema is declared
      if (dataSchemas) {
        ctx.writeToolData = (
          type: string,
          data: unknown,
          opts?: { id?: string; transient?: boolean },
        ) => {
          const schema = dataSchemas[type];
          if (!schema) {
            throw new Error(
              `Unknown data type: "${type}". Valid types: ${Object.keys(dataSchemas).join(", ")}`,
            );
          }
          schema.parse(data);
          rawWriteData({
            type,
            data,
            id: opts?.id,
            transient: opts?.transient,
            toolCallId,
            toolName,
          });
        };
      }

      if (hasContext) {
        ctx.context = injection.context;
      }

      if (isSuspendable) {
        const resumeData = injection.resumeData;
        const resumeHistory = (injection.resumeHistory as unknown[]) ?? [];

        ctx.suspend = (data: unknown) => {
          options.suspendSchema.parse(data);
          return suspendFn(data);
        };

        if (resumeData !== undefined) {
          options.resumeSchema.parse(resumeData);
        }

        ctx.resumeData = resumeData;
        ctx.resumeHistory = resumeHistory;
      }

      const result = await execute(ctx);

      // Validate output against outputSchema, but skip for SuspendResult
      if (outputSchema && !isSuspendResult(result)) {
        outputSchema.parse(result);
      }

      return result;
    },
  }) as ZaikitTool<any, any>;

  if (Object.keys(meta).length > 0) {
    (t as any).__meta = meta;
  }

  return t;
}
