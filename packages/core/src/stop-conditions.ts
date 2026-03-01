import type { StopCondition } from "ai";
import { isSuspendResult } from "./suspend";

/**
 * Stop condition that halts the LLM loop when any tool in the last step
 * returned a SuspendResult. Always composed into createAgent's stopWhen
 * so the stream ends and the client can prompt the user for input.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hasSuspendedTool: StopCondition<any> = ({ steps }) => {
  const lastStep = steps.at(-1);
  return (
    lastStep?.toolResults?.some((r: any) => isSuspendResult(r.output)) ?? false
  );
};
