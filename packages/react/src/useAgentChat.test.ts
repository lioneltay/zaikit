import { act, renderHook } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSendBody, useAgentChat } from "./useAgentChat";

// -- Helpers --

function userMessage(text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function assistantMessageWithToolOutput(
  toolCallId: string,
  toolName: string,
  output: unknown,
): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [
      {
        type: `tool-${toolName}` as any,
        toolCallId,
        toolName,
        state: "output-available",
        output,
      },
    ],
  };
}

// Minimal SSE response the AI SDK transport can consume
function sseResponse() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('0:""\n'));
      controller.enqueue(
        encoder.encode(
          'e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n',
        ),
      );
      controller.enqueue(encoder.encode("d:{}\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function lastFetchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const raw = (calls[calls.length - 1][1] as RequestInit).body as string;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

const defaultOpts = {
  threadId: "thread-1",
  getFrontendTools: () => [],
  isFrontendTool: () => false,
};

const defaultHookOpts = {
  api: "/api/chat",
  threadId: "thread-1",
  initialMessages: [] as UIMessage[],
  getFrontendTools: () => [],
  isFrontendTool: () => false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

// -- Unit tests: body construction --

describe("buildSendBody", () => {
  it("includes extra body fields for user messages", () => {
    const messages = [userMessage("hello")];

    const result = buildSendBody(messages, {
      ...defaultOpts,
      extraBody: { context: { userId: "user-1" } },
    });

    expect(result.body.context).toEqual({ userId: "user-1" });
    expect(result.body.threadId).toBe("thread-1");
    expect(result.body.message).toBe(messages[0]);
  });

  it("includes extra body fields for tool output continuations", () => {
    const messages = [assistantMessageWithToolOutput("tc-1", "my_tool", "ok")];

    const result = buildSendBody(messages, {
      ...defaultOpts,
      extraBody: { context: { userId: "user-1" } },
      isFrontendTool: (name) => name === "my_tool",
    });

    expect(result.body.context).toEqual({ userId: "user-1" });
    expect(result.body.toolOutputs).toEqual([
      { toolCallId: "tc-1", output: "ok" },
    ]);
  });

  it("works without extra body", () => {
    const result = buildSendBody([userMessage("hello")], defaultOpts);

    expect(result.body.threadId).toBe("thread-1");
    expect(result.body.message).toBeDefined();
  });

  it("core fields take precedence over extra body", () => {
    const messages = [userMessage("hello")];

    const result = buildSendBody(messages, {
      ...defaultOpts,
      extraBody: { threadId: "hijacked", message: "hijacked" },
    });

    expect(result.body.threadId).toBe("thread-1");
    expect(result.body.message).toBe(messages[0]);
  });
});

// -- Integration tests: full hook → fetch --

describe("useAgentChat", () => {
  describe("sendMessage", () => {
    it("includes body fields in the fetch request", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(sseResponse()),
      );

      const { result } = renderHook(() =>
        useAgentChat({
          ...defaultHookOpts,
          body: { context: { userId: "user-1" } },
        }),
      );

      await act(async () => {
        result.current.sendMessage?.({ text: "hello" });
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(globalThis.fetch).toHaveBeenCalled();
      const body = lastFetchBody();
      expect(body.context).toEqual({ userId: "user-1" });
      expect(body.threadId).toBe("thread-1");
    });

    it("core fields are not overridden by body prop", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(sseResponse()),
      );

      const { result } = renderHook(() =>
        useAgentChat({
          ...defaultHookOpts,
          body: { threadId: "hijacked" },
        }),
      );

      await act(async () => {
        result.current.sendMessage?.({ text: "hello" });
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(lastFetchBody().threadId).toBe("thread-1");
    });
  });

  describe("resumeTool", () => {
    it("includes body fields in the fetch request", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("", { status: 204 }),
      );

      const { result } = renderHook(() =>
        useAgentChat({
          ...defaultHookOpts,
          body: { context: { userId: "user-1" } },
        }),
      );

      await act(async () => {
        await result.current.resumeTool("tc-1", { approved: true });
      });

      const body = lastFetchBody();
      expect(body.context).toEqual({ userId: "user-1" });
      expect(body.threadId).toBe("thread-1");
      expect(body.resume).toEqual({
        toolCallId: "tc-1",
        data: { approved: true },
      });
    });

    it("works without body prop", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("", { status: 204 }),
      );

      const { result } = renderHook(() => useAgentChat(defaultHookOpts));

      await act(async () => {
        await result.current.resumeTool("tc-1", { approved: true });
      });

      const body = lastFetchBody();
      expect(body.context).toBeUndefined();
      expect(body.threadId).toBe("thread-1");
    });

    it("core fields are not overridden by body prop", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("", { status: 204 }),
      );

      const { result } = renderHook(() =>
        useAgentChat({
          ...defaultHookOpts,
          body: { threadId: "hijacked", resume: "hijacked" },
        }),
      );

      await act(async () => {
        await result.current.resumeTool("tc-1", { approved: true });
      });

      const body = lastFetchBody();
      expect(body.threadId).toBe("thread-1");
      expect(body.resume).toEqual({
        toolCallId: "tc-1",
        data: { approved: true },
      });
    });
  });
});
