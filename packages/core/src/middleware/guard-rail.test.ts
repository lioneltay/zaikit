import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "./core";
import { composeMiddleware, createAbort } from "./core";
import { guardRail } from "./guard-rail";

/** Minimal stream that emits a single text-delta then closes. */
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
    system: undefined,
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

const blockedMsg: UIMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "do something bad" }],
};

describe("guardRail middleware", () => {
  it("passes through when check returns undefined (sync)", async () => {
    const mw = guardRail(() => undefined);
    const chain = composeMiddleware([mw], () => textStream("ok"));
    const result = await collectText(chain(makeCtx([userMsg])));
    expect(result).toBe("ok");
  });

  it("aborts when check returns a string (sync)", async () => {
    const mw = guardRail(() => "Blocked");
    const chain = composeMiddleware([mw], () => textStream("should not reach"));
    const result = await collectText(chain(makeCtx([blockedMsg])));
    expect(result).toBe("Blocked");
  });

  it("passes through when async check returns undefined", async () => {
    const mw = guardRail(async () => undefined);
    const chain = composeMiddleware([mw], () => textStream("ok"));
    const result = await collectText(chain(makeCtx([userMsg])));
    expect(result).toBe("ok");
  });

  it("aborts when async check returns a string", async () => {
    const mw = guardRail(async () => "Not allowed");
    const chain = composeMiddleware([mw], () => textStream("should not reach"));
    const result = await collectText(chain(makeCtx([blockedMsg])));
    expect(result).toBe("Not allowed");
  });

  it("receives the conversation messages", async () => {
    let received: UIMessage[] = [];
    const mw = guardRail((messages) => {
      received = messages;
      return undefined;
    });
    const chain = composeMiddleware([mw], () => textStream("ok"));
    await collectText(chain(makeCtx([userMsg])));
    expect(received).toHaveLength(1);
    expect(received[0].role).toBe("user");
  });
});
