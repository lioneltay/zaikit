import type { LanguageModel, ToolSet, UIMessage } from "ai";
import { withStreamSpan } from "../tracing";

export type MiddlewareContext = {
  /** Mutable: messages sent to the LLM. Modify before calling next(). */
  messages: UIMessage[];
  /** Mutable: language model to use. */
  model: LanguageModel;
  /** Mutable: system prompt. Resolved from the agent's `system` option before middleware runs. */
  system: string | undefined;
  /** Mutable: tools available to the LLM. */
  tools: ToolSet;
  /** Read-only: thread identifier (present when called via chat or when explicitly provided). */
  readonly threadId?: string;
  /** Abort the response with an error message. Throws internally. */
  abort: (message: string) => never;
};

type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => ReadableStream<unknown>,
) => ReadableStream<unknown>;

export type Middleware =
  | MiddlewareFn
  | { name?: string; handler: MiddlewareFn };

/** Extract the handler function and optional name from a Middleware value. */
function normalizeMiddleware(mw: Middleware): {
  name: string | undefined;
  handler: MiddlewareFn;
} {
  if (typeof mw === "function") return { name: undefined, handler: mw };
  return { name: mw.name, handler: mw.handler };
}

class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortError";
  }
}

/** Throw an AbortError that middleware composition catches. */
export function createAbort(): (message: string) => never {
  return (message: string): never => {
    throw new AbortError(message);
  };
}

/**
 * Compose middleware into a chain: first middleware is outermost.
 *
 * The `core` function receives the (possibly mutated) context and returns
 * the base response stream. Middleware can modify context before calling
 * next(), transform the returned stream, or skip next() entirely.
 *
 * When `telemetryEnabled` is true, each middleware is wrapped in a
 * `zaikit.middleware` span that covers its full lifecycle.
 */
export function composeMiddleware(
  middleware: Middleware[],
  core: (ctx: MiddlewareContext) => ReadableStream<unknown>,
  telemetryEnabled = false,
): (ctx: MiddlewareContext) => ReadableStream<unknown> {
  if (middleware.length === 0) return core;

  // Build the chain from inside out: last middleware wraps core first
  let chain = core;
  for (let i = middleware.length - 1; i >= 0; i--) {
    const { name, handler } = normalizeMiddleware(middleware[i]);
    const inner = chain;
    const spanName = name ?? `middleware-${i}`;
    chain = (ctx) => {
      try {
        const invoke = () => handler(ctx, () => inner(ctx));
        if (!telemetryEnabled) return invoke();
        return withStreamSpan(
          `middleware: '${spanName}'`,
          {
            "zaikit.middleware.name": spanName,
            "zaikit.middleware.index": i,
          },
          invoke,
        );
      } catch (err) {
        if (err instanceof AbortError) {
          return abortStream(err.message);
        }
        throw err;
      }
    };
  }

  return chain;
}

/** Create a stream that emits a single text chunk with the abort message. */
function abortStream(message: string): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: "start" as const,
      });
      controller.enqueue({
        type: "text-start" as const,
        id: "abort-text",
      });
      controller.enqueue({
        type: "text-delta" as const,
        id: "abort-text",
        delta: message,
      });
      controller.enqueue({
        type: "text-end" as const,
        id: "abort-text",
      });
      controller.enqueue({
        type: "finish" as const,
      });
      controller.close();
    },
  });
}
