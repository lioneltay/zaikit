import { tool, type Tool } from "ai";
import type { z } from "zod";
import { type SuspendResult, isSuspendResult, suspend as suspendFn } from "./suspend.js";
import { getResumeData } from "./suspend-context.js";

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
): Tool<INPUT, OUTPUT>;

export function createTool<INPUT, OUTPUT, SUSPEND, RESUME>(
  options: SuspendableToolOptions<INPUT, OUTPUT, SUSPEND, RESUME>,
): Tool<INPUT, OUTPUT | SuspendResult<SUSPEND>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTool(options: any): Tool<any, any> {
  const { description, inputSchema, outputSchema, execute } = options;

  const isSuspendable = options.suspendSchema && options.resumeSchema;

  return tool({
    description,
    inputSchema,
    // Don't pass outputSchema to the SDK — we validate manually to allow SuspendResult through
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
  });
}
