import type { UIMessage } from "ai";
import type { Middleware } from "./core";

/**
 * Input guard middleware. Checks messages before the LLM runs.
 *
 * Return `undefined` to proceed, or a string to abort — the string
 * is shown to the user as the response via `ctx.abort()`.
 *
 * ```ts
 * guardRail(async (messages) => {
 *   const text = getLastUserText(messages)
 *   if (isToxic(text)) return "I can't help with that."
 * })
 * ```
 */
export function guardRail(
  check: (
    messages: UIMessage[],
  ) => Promise<string | undefined> | string | undefined,
): Middleware {
  return (ctx, next) => {
    const result = check(ctx.messages);

    if (result instanceof Promise) {
      // Async check — need to return a stream that awaits the result
      return new ReadableStream({
        async start(controller) {
          const message = await result;
          if (message !== undefined) {
            // Can't use ctx.abort() here — it throws synchronously and
            // composeMiddleware won't catch it inside an async stream.
            // Emit the abort stream pattern directly.
            controller.enqueue({ type: "start" });
            controller.enqueue({ type: "text-start", id: "guard-rail" });
            controller.enqueue({
              type: "text-delta",
              id: "guard-rail",
              delta: message,
            });
            controller.enqueue({ type: "text-end", id: "guard-rail" });
            controller.enqueue({ type: "finish" });
            controller.close();
            return;
          }
          // Passed — pipe next() through
          const reader = next().getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        },
      });
    }

    // Sync check
    if (result !== undefined) {
      ctx.abort(result);
    }
    return next();
  };
}
