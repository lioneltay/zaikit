import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "./core";
import { composeMiddleware, createAbort } from "./core";
import { rag } from "./rag";

function textStream(text: string): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "text-delta", delta: text });
      controller.close();
    },
  });
}

function makeCtx(messages: UIMessage[]): MiddlewareContext {
  return {
    messages,
    model: {} as any,
    tools: {},
    threadId: "t1",
    abort: createAbort(),
  };
}

async function collectText(stream: ReadableStream<unknown>): Promise<string> {
  const reader = stream.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((value as any).type === "text-delta") result += (value as any).delta;
  }
  return result;
}

const userMsg: UIMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "hello" }],
};

describe("rag middleware", () => {
  it("injects a system message (sync)", async () => {
    let capturedMessages: UIMessage[] = [];
    const mw = rag(() => ({ role: "system", content: "extra context" }));
    const chain = composeMiddleware([mw], (ctx) => {
      capturedMessages = ctx.messages;
      return textStream("ok");
    });

    await collectText(chain(makeCtx([userMsg])));

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[1].role).toBe("system");
    expect((capturedMessages[1].parts[0] as any).text).toBe("extra context");
  });

  it("injects a user message (async)", async () => {
    let capturedMessages: UIMessage[] = [];
    const mw = rag(async () => ({ role: "user", content: "retrieved docs" }));
    const chain = composeMiddleware([mw], (ctx) => {
      capturedMessages = ctx.messages;
      return textStream("ok");
    });

    await collectText(chain(makeCtx([userMsg])));

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[1].role).toBe("user");
    expect((capturedMessages[1].parts[0] as any).text).toBe("retrieved docs");
  });

  it("receives conversation messages for query extraction", async () => {
    let received: UIMessage[] = [];
    const mw = rag((messages) => {
      received = messages;
      return { role: "system", content: "context" };
    });
    const chain = composeMiddleware([mw], () => textStream("ok"));

    await collectText(chain(makeCtx([userMsg])));

    expect(received).toHaveLength(1);
    expect(received[0].role).toBe("user");
  });

  it("streams output through after injection", async () => {
    const mw = rag(() => ({ role: "system", content: "docs" }));
    const chain = composeMiddleware([mw], () => textStream("response"));

    const result = await collectText(chain(makeCtx([userMsg])));
    expect(result).toBe("response");
  });
});
