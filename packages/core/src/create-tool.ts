import { type Tool, tool } from "ai";
import { toJSONSchema, type z } from "zod";
import {
  isSuspendResult,
  type SuspendResult,
  suspend as suspendFn,
} from "./suspend";
import { getToolInjection } from "./tool-injection";

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
> = Tool<INPUT, OUTPUT> & {
  readonly __toolTypes: {
    readonly input: INPUT;
    readonly output: Exclude<OUTPUT, SuspendResult<any>>;
    readonly suspend: SUSPEND;
    readonly resume: RESUME;
    readonly context: CONTEXT;
  };
  readonly __meta?: ToolMeta;
};

// Base options shared by both overloads
type BaseToolOptions<INPUT> = {
  description: string;
  inputSchema: z.ZodType<INPUT>;
};

// Regular tool options (no suspend/resume)

type RegularToolOptions<
  INPUT,
  OUTPUT,
  CONTEXT = undefined,
> = BaseToolOptions<INPUT> &
  ([CONTEXT] extends [undefined]
    ? {
        context?: never;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema?: never;
        resumeSchema?: never;
        execute: (ctx: { input: INPUT }) => Promise<OUTPUT>;
      }
    : {
        context: z.ZodType<CONTEXT>;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema?: never;
        resumeSchema?: never;
        execute: (ctx: { input: INPUT; context: CONTEXT }) => Promise<OUTPUT>;
      });

// Suspendable tool options (with suspend/resume schemas)
type SuspendableToolOptions<
  INPUT,
  OUTPUT,
  SUSPEND,
  RESUME,
  CONTEXT = undefined,
> = BaseToolOptions<INPUT> &
  ([CONTEXT] extends [undefined]
    ? {
        context?: never;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema: z.ZodType<SUSPEND>;
        resumeSchema: z.ZodType<RESUME>;
        execute: (ctx: {
          input: INPUT;
          suspend: (data: SUSPEND) => SuspendResult<SUSPEND>;
          resumeData: RESUME | undefined;
        }) => Promise<OUTPUT | SuspendResult<SUSPEND>>;
      }
    : {
        context: z.ZodType<CONTEXT>;
        outputSchema?: z.ZodType<OUTPUT>;
        suspendSchema: z.ZodType<SUSPEND>;
        resumeSchema: z.ZodType<RESUME>;
        execute: (ctx: {
          input: INPUT;
          context: CONTEXT;
          suspend: (data: SUSPEND) => SuspendResult<SUSPEND>;
          resumeData: RESUME | undefined;
        }) => Promise<OUTPUT | SuspendResult<SUSPEND>>;
      });

// Overload: regular tool without context
export function createTool<INPUT, OUTPUT>(
  options: RegularToolOptions<INPUT, OUTPUT>,
): ZaikitTool<INPUT, OUTPUT>;

// Overload: regular tool with context
export function createTool<INPUT, OUTPUT, CONTEXT>(
  options: RegularToolOptions<INPUT, OUTPUT, CONTEXT>,
): ZaikitTool<INPUT, OUTPUT, never, never, CONTEXT>;

// Overload: suspendable tool without context
export function createTool<INPUT, OUTPUT, SUSPEND, RESUME>(
  options: SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME>,
): ZaikitTool<INPUT, OUTPUT | SuspendResult<SUSPEND>, SUSPEND, RESUME>;

// Overload: suspendable tool with context
export function createTool<INPUT, OUTPUT, SUSPEND, RESUME, CONTEXT>(
  options: SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME, CONTEXT>,
): ZaikitTool<INPUT, OUTPUT | SuspendResult<SUSPEND>, SUSPEND, RESUME, CONTEXT>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTool(options: any): ZaikitTool<any, any> {
  const { description, inputSchema, outputSchema, execute } = options;

  const isSuspendable = options.suspendSchema && options.resumeSchema;
  const hasContext = !!options.context;

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
    execute: async (input) => {
      const injection = getToolInjection();
      const ctx: Record<string, unknown> = { input };

      if (hasContext) {
        ctx.context = injection.context;
      }

      if (isSuspendable) {
        const resumeData = injection.resumeData;

        ctx.suspend = (data: unknown) => {
          options.suspendSchema.parse(data);
          return suspendFn(data);
        };

        if (resumeData !== undefined) {
          options.resumeSchema.parse(resumeData);
        }

        ctx.resumeData = resumeData;
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
