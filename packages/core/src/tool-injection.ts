/**
 * Unified AsyncLocalStorage bridge for injecting values into tool execute
 * functions.
 *
 * The AI SDK's tool.execute signature is fixed as (input, { toolCallId, messages })
 * with no way to pass custom data. We use a single AsyncLocalStorage instance to
 * thread all injected values — agent context, resume data, and future additions —
 * from the agent layer into createTool's execute wrapper.
 *
 * This is an internal implementation detail — not exported from the package.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { InternalWriteDataFn } from "./write-data";

type ToolInjection = {
  /** Request-scoped context provided via agent.chat({ context }) */
  context?: unknown;
  /** Resume data provided when resuming a suspended tool (latest) */
  resumeData?: unknown;
  /** Accumulated resume responses from previous suspensions (multi-suspend) */
  resumeHistory?: unknown[];
  /** Callback to emit custom data parts to the stream */
  writeData?: InternalWriteDataFn;
  /** Name of the currently executing tool (set by agent-helpers) */
  toolName?: string;
};

const store = new AsyncLocalStorage<ToolInjection>();

/**
 * Run a function with the given injection values available to tools via ALS.
 * Merges with any existing injection from an outer scope so callers can set
 * values independently.
 */
export function runWithToolInjection<T>(
  injection: ToolInjection,
  fn: () => T,
): T {
  const current = store.getStore();
  return store.run({ ...current, ...injection }, fn);
}

export function getToolInjection(): ToolInjection {
  return store.getStore() ?? {};
}
