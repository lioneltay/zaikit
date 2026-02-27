/**
 * AsyncLocalStorage bridge for passing resumeData into tool execute functions.
 *
 * The AI SDK's tool.execute signature is fixed as (input, { toolCallId, messages })
 * with no way to inject custom per-request context. We use AsyncLocalStorage to
 * thread resumeData from handleResume (agent.ts) into createTool's execute wrapper
 * (create-tool.ts), which then exposes it as `{ resumeData }` in the tool author's
 * execute function.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type SuspendContext = {
  resumeData?: unknown;
};

const suspendStore = new AsyncLocalStorage<SuspendContext>();

export function runWithSuspendContext<T>(
  context: SuspendContext,
  fn: () => T,
): T {
  return suspendStore.run(context, fn);
}

export function getResumeData<T>(): T | undefined {
  return suspendStore.getStore()?.resumeData as T | undefined;
}
