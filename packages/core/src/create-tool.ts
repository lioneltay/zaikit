import { tool, type Tool } from "ai";
import type { z } from "zod";
import { type SuspendResult, isSuspendResult, suspend as suspendFn } from "./suspend.js";
import { getResumeData } from "./suspend-context.js";

// Enriched tool type that preserves all type parameters for codegen.
// Extends the AI SDK's Tool so it satisfies ToolSet everywhere.
// The __toolTypes property is a phantom brand — it exists only in the
// type system for codegen to read. No runtime cost.
export type AikitTool<
  INPUT = any,
  OUTPUT = any,
  SUSPEND = never,
  RESUME = never,
> = Tool<INPUT, OUTPUT> & {
  readonly __toolTypes: {
    readonly input: INPUT;
    readonly output: Exclude<OUTPUT, SuspendResult<any>>;
    readonly suspend: SUSPEND;
    readonly resume: RESUME;
  };
};

// Base options shared by both overloads
type BaseToolOptions<INPUT> = {
  description: string;
  inputSchema: z.ZodType<INPUT>;
};

// Regular tool options (no suspend/resume)
type RegularToolOptions<INPUT, OUTPUT> = BaseToolOptions<INPUT> & {
  outputSchema?: z.ZodType<OUTPUT>;
  suspendSchema?: never;
  resumeSchema?: never;
  execute: (ctx: { input: INPUT }) => Promise<OUTPUT>;
};

// Suspendable tool options (with suspend/resume schemas)
type SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME> = BaseToolOptions<INPUT> & {
  outputSchema?: z.ZodType<OUTPUT>;
  suspendSchema: z.ZodType<SUSPEND>;
  resumeSchema: z.ZodType<RESUME>;
  execute: (ctx: {
    input: INPUT;
    suspend: (data: SUSPEND) => SuspendResult<SUSPEND>;
    resumeData: RESUME | undefined;
  }) => Promise<OUTPUT | SuspendResult<SUSPEND>>;
};

export function createTool<INPUT, OUTPUT>(
  options: RegularToolOptions<INPUT, OUTPUT>,
): AikitTool<INPUT, OUTPUT>;

export function createTool<INPUT, OUTPUT, SUSPEND, RESUME>(
  options: SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME>,
): AikitTool<INPUT, OUTPUT | SuspendResult<SUSPEND>, SUSPEND, RESUME>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTool(options: any): AikitTool<any, any> {
  const { description, inputSchema, outputSchema, execute } = options;

  const isSuspendable = options.suspendSchema && options.resumeSchema;

  return tool({
    description,
    inputSchema,
    execute: async (input) => {
      let result: unknown;

      if (isSuspendable) {
        const resumeData = getResumeData();

        const suspend = (data: unknown) => {
          options.suspendSchema.parse(data);
          return suspendFn(data);
        };

        if (resumeData !== undefined) {
          options.resumeSchema.parse(resumeData);
        }

        result = await execute({ input, suspend, resumeData });
      } else {
        result = await execute({ input });
      }

      // Validate output against outputSchema, but skip for SuspendResult
      if (outputSchema && !isSuspendResult(result)) {
        outputSchema.parse(result);
      }

      return result;
    },
  }) as AikitTool<any, any>;
}
