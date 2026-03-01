import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toJSONSchema, type ZodType } from "zod";
import type { ToolRenderProps, ToolRenderState } from "./types.js";
import { useAgent } from "./useAgent.js";
import { useToolRenderer } from "./useToolRenderer.js";

export type UseToolRenderProps<INPUT> = {
  args: INPUT;
  state: ToolRenderState;
  result: unknown;
  resume: (data: unknown) => void;
};

export type UseToolOptions<INPUT> = {
  name: string;
  description: string;
  inputSchema: ZodType<INPUT>;
  execute?: (args: INPUT) => unknown | Promise<unknown>;
  render?: (props: UseToolRenderProps<INPUT>) => React.ReactNode;
};

/**
 * Inner component that manages handler execution and rendering for a frontend tool call.
 * Frontend tools trigger on state === "call" (input-available) and call resume()
 * which routes to addToolOutput via the AgentProvider.
 *
 * For execute-only tools, we must wait for the stream to finish (status === "ready")
 * before calling resume/addToolOutput, because the AI SDK's sendAutomaticallyWhen
 * guard skips auto-send while status is "streaming" or "submitted".
 */
function FrontendToolExecutor({
  toolProps,
  execute,
  render,
}: {
  toolProps: ToolRenderProps;
  execute?: (args: any) => any;
  render?: (props: any) => React.ReactNode;
}) {
  const { status } = useAgent();
  const executeRanRef = useRef(false);
  const resumedRef = useRef(false);
  const [executeResult, setExecuteResult] = useState<{
    value: unknown;
  } | null>(null);

  // Run execute when the tool call is ready (state === "call" means input-available)
  useEffect(() => {
    if (toolProps.state !== "call") return;
    if (executeRanRef.current) return;
    if (!execute) return;
    executeRanRef.current = true;

    Promise.resolve(execute(toolProps.args))
      .then((result) => {
        setExecuteResult({ value: result });
      })
      .catch((err) => {
        console.error(`useTool execute "${toolProps.toolName}" failed:`, err);
        setExecuteResult({ value: { error: String(err) } });
      });
  }, [toolProps.state, execute, toolProps.args, toolProps.toolName]);

  // Call resume (→ addToolOutput) only after the stream finishes,
  // so sendAutomaticallyWhen can trigger the follow-up request.
  useEffect(() => {
    if (!executeResult) return;
    if (resumedRef.current) return;
    if (status !== "ready") return;
    resumedRef.current = true;
    toolProps.resume(executeResult.value);
  }, [executeResult, status, toolProps.resume]);

  if (toolProps.state === "result") {
    if (render) {
      return render({
        args: toolProps.args,
        state: "result",
        result: toolProps.result,
        resume: toolProps.resume,
      });
    }
    return null;
  }

  if (toolProps.state === "call") {
    // Render-only tools: show interactive UI
    if (render && !execute) {
      return render({
        args: toolProps.args,
        state: "call",
        result: undefined,
        resume: toolProps.resume,
      });
    }

    // Execute-only or execute+render: execute runs via useEffect, nothing to render yet
    return null;
  }

  return null;
}

export function useTool<INPUT>({
  name,
  description,
  inputSchema,
  execute,
  render,
}: UseToolOptions<INPUT>): void {
  const { registerFrontendTool } = useAgent();

  const parameters = useMemo(
    () => toJSONSchema(inputSchema) as Record<string, unknown>,
    [inputSchema],
  );

  useEffect(() => {
    return registerFrontendTool({ name, description, parameters });
  }, [name, description, parameters, registerFrontendTool]);

  useToolRenderer(name, (props: ToolRenderProps) => (
    <FrontendToolExecutor toolProps={props} execute={execute} render={render} />
  ));
}
