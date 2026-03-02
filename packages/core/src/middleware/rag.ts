import type { UIMessage } from "ai";
import type { Middleware } from "./core";

type RagMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * RAG (Retrieval-Augmented Generation) middleware.
 *
 * Takes a function that receives the conversation messages and returns
 * a message to inject into the context before the LLM runs.
 *
 * ```ts
 * rag(async (messages) => {
 *   const docs = await vectorDb.search(getLastUserText(messages))
 *   return { role: "system", content: `Context:\n${docs.join("\n")}` }
 * })
 * ```
 */
export function rag(
  retrieve: (messages: UIMessage[]) => Promise<RagMessage> | RagMessage,
): Middleware {
  return (ctx, next) => {
    const result = retrieve(ctx.messages);

    if (result instanceof Promise) {
      // Async retrieve — need to return a stream that awaits the result
      return new ReadableStream({
        async start(controller) {
          const msg = await result;
          ctx.messages = [
            ...ctx.messages,
            {
              id: "rag-context",
              role: msg.role,
              parts: [{ type: "text", text: msg.content }],
            },
          ];
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

    // Sync retrieve
    ctx.messages = [
      ...ctx.messages,
      {
        id: "rag-context",
        role: result.role,
        parts: [{ type: "text", text: result.content }],
      },
    ];
    return next();
  };
}
