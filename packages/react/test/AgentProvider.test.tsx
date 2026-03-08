import { act, render } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProvider, type AgentProviderProps } from "../src/AgentProvider";
import { useAgent } from "../src/useAgent";

// ---------------------------------------------------------------------------
// Mock useAgentChat — we're testing AgentProvider orchestration, not the hook
// ---------------------------------------------------------------------------

const mockSetMessages = vi.fn();
const mockSendMessage = vi.fn();
const mockResumeTool = vi.fn();
const mockAddToolOutput = vi.fn();

const mockChat = {
  messages: [] as UIMessage[],
  rawMessages: [] as UIMessage[],
  status: "ready" as string,
  sendMessage: mockSendMessage,
  resumeTool: mockResumeTool,
  addToolOutput: mockAddToolOutput,
  hasSuspendedTools: false,
  setMessages: mockSetMessages,
};

vi.mock("../src/useAgentChat", () => ({
  useAgentChat: vi.fn(() => mockChat),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msg(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

/** Renders AgentProvider and returns the context value via useAgent. */
function renderWithAgent(
  providerProps: Partial<AgentProviderProps> & {
    threadId?: string;
    initialThreadId?: string;
  },
) {
  const contextRef: { current: ReturnType<typeof useAgent> | null } = {
    current: null,
  };

  function Consumer() {
    contextRef.current = useAgent();
    return null;
  }

  const props = {
    api: "/api/chat",
    children: <Consumer />,
    ...providerProps,
  } as AgentProviderProps;

  const result = render(<AgentProvider {...props} />);
  return { contextRef, ...result };
}

afterEach(() => {
  vi.clearAllMocks();
  mockChat.messages = [];
  mockChat.rawMessages = [];
});

// ---------------------------------------------------------------------------
// Thread management
// ---------------------------------------------------------------------------

describe("AgentProvider — thread management", () => {
  describe("controlled mode", () => {
    it("exposes the controlled threadId", () => {
      const { contextRef } = renderWithAgent({ threadId: "t-1" });
      expect(contextRef.current?.threadId).toBe("t-1");
    });

    it("updates when threadId prop changes", () => {
      const { contextRef, rerender } = renderWithAgent({ threadId: "t-1" });
      expect(contextRef.current?.threadId).toBe("t-1");

      rerender(
        <AgentProvider api="/api/chat" threadId="t-2">
          <ContextCapture contextRef={contextRef} />
        </AgentProvider>,
      );
      expect(contextRef.current?.threadId).toBe("t-2");
    });

    it("calls onThreadChange when setThreadId is called", () => {
      const onThreadChange = vi.fn();
      const { contextRef } = renderWithAgent({
        threadId: "t-1",
        onThreadChange,
      });

      act(() => {
        contextRef.current?.setThreadId("t-2");
      });

      expect(onThreadChange).toHaveBeenCalledWith("t-2");
    });

    it("does not change internal state in controlled mode", () => {
      const { contextRef, rerender } = renderWithAgent({ threadId: "t-1" });

      act(() => {
        contextRef.current?.setThreadId("t-2");
      });

      // Rerender with same controlled prop — should still be t-1
      rerender(
        <AgentProvider api="/api/chat" threadId="t-1">
          <ContextCapture contextRef={contextRef} />
        </AgentProvider>,
      );
      expect(contextRef.current?.threadId).toBe("t-1");
    });
  });

  describe("uncontrolled mode", () => {
    it("exposes the initial threadId", () => {
      const { contextRef } = renderWithAgent({ initialThreadId: "t-1" });
      expect(contextRef.current?.threadId).toBe("t-1");
    });

    it("updates internal state when setThreadId is called", () => {
      const onThreadChange = vi.fn();
      const { contextRef } = renderWithAgent({
        initialThreadId: "t-1",
        onThreadChange,
      });

      act(() => {
        contextRef.current?.setThreadId("t-2");
      });

      expect(contextRef.current?.threadId).toBe("t-2");
      expect(onThreadChange).toHaveBeenCalledWith("t-2");
    });
  });

  describe("createNewThread", () => {
    it("returns a new UUID and updates the thread", () => {
      const onThreadChange = vi.fn();
      const { contextRef } = renderWithAgent({
        initialThreadId: "t-1",
        onThreadChange,
      });

      let newId: string | undefined;
      act(() => {
        newId = contextRef.current?.createNewThread();
      });

      expect(newId).toBeDefined();
      expect(newId).not.toBe("t-1");
      // UUID format check
      expect(newId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(contextRef.current?.threadId).toBe(newId);
      expect(onThreadChange).toHaveBeenCalledWith(newId);
    });
  });
});

// ---------------------------------------------------------------------------
// Message loading on thread change
// ---------------------------------------------------------------------------

describe("AgentProvider — message loading", () => {
  it("calls fetchMessages on mount", async () => {
    const fetchMessages = vi.fn().mockResolvedValue([msg("m1", "hello")]);

    renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    // useEffect runs asynchronously
    await act(async () => {
      await flushPromises();
    });

    expect(fetchMessages).toHaveBeenCalledWith("t-1");
    expect(mockSetMessages).toHaveBeenCalledWith([msg("m1", "hello")]);
  });

  it("clears messages before fetching", async () => {
    const fetchMessages = vi.fn().mockResolvedValue([msg("m1", "hello")]);

    renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    // setMessages([]) should be called first (clear), then setMessages([msg])
    expect(mockSetMessages.mock.calls[0]).toEqual([[]]);
    expect(mockSetMessages.mock.calls[1]).toEqual([[msg("m1", "hello")]]);
  });

  it("refetches when threadId changes", async () => {
    const fetchMessages = vi.fn().mockResolvedValue([]);

    const { rerender, contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    expect(fetchMessages).toHaveBeenCalledWith("t-1");
    fetchMessages.mockClear();
    mockSetMessages.mockClear();

    rerender(
      <AgentProvider
        api="/api/chat"
        threadId="t-2"
        fetchMessages={fetchMessages}
      >
        <ContextCapture contextRef={contextRef} />
      </AgentProvider>,
    );

    await act(async () => {
      await flushPromises();
    });

    expect(fetchMessages).toHaveBeenCalledWith("t-2");
  });

  it("ignores stale fetch results after rapid thread switches", async () => {
    const resolvers: Array<(msgs: UIMessage[]) => void> = [];

    const firstPromise = new Promise<UIMessage[]>((r) => {
      resolvers.push(r);
    });
    const secondPromise = new Promise<UIMessage[]>((r) => {
      resolvers.push(r);
    });

    let callCount = 0;
    const fetchMessages = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? firstPromise : secondPromise;
    });

    const { rerender, contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    // Switch to t-2 before t-1 resolves
    mockSetMessages.mockClear();
    rerender(
      <AgentProvider
        api="/api/chat"
        threadId="t-2"
        fetchMessages={fetchMessages}
      >
        <ContextCapture contextRef={contextRef} />
      </AgentProvider>,
    );

    await act(async () => {
      await flushPromises();
    });

    // Now resolve both — first should be ignored
    await act(async () => {
      resolvers[0]([msg("stale", "stale message")]);
      resolvers[1]([msg("fresh", "fresh message")]);
      await flushPromises();
    });

    // The stale result (t-1) should NOT be set — only the clear + fresh result
    const setMessagesCalls = mockSetMessages.mock.calls.map((c) => c[0]);
    const messageSets = setMessagesCalls.filter(
      (m: UIMessage[]) => m.length > 0,
    );
    expect(messageSets).toHaveLength(1);
    expect(messageSets[0][0].id).toBe("fresh");
  });

  it("does not call fetchMessages if not provided", async () => {
    renderWithAgent({ threadId: "t-1" });

    await act(async () => {
      await flushPromises();
    });

    expect(mockSetMessages).not.toHaveBeenCalled();
  });

  it("sets isLoadingMessages while fetching", async () => {
    let resolveFetch: (msgs: UIMessage[]) => void;
    const fetchPromise = new Promise<UIMessage[]>((r) => {
      resolveFetch = r;
    });
    const fetchMessages = vi.fn().mockReturnValue(fetchPromise);

    const { contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    // After effect fires but before fetch resolves
    await act(async () => {
      await flushPromises();
    });

    expect(contextRef.current?.isLoadingMessages).toBe(true);

    // Resolve the fetch
    await act(async () => {
      resolveFetch([msg("m1", "hello")]);
      await flushPromises();
    });

    expect(contextRef.current?.isLoadingMessages).toBe(false);
  });

  it("isLoadingMessages is false when no fetchMessages provided", () => {
    const { contextRef } = renderWithAgent({ threadId: "t-1" });
    expect(contextRef.current?.isLoadingMessages).toBe(false);
  });

  it("handles fetchMessages rejection gracefully", async () => {
    const fetchMessages = vi.fn().mockRejectedValue(new Error("network error"));

    // Should not throw
    renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    // setMessages([]) for the clear, but no subsequent call since fetch failed
    expect(mockSetMessages).toHaveBeenCalledWith([]);
    expect(mockSetMessages).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// loadOlderMessages
// ---------------------------------------------------------------------------

describe("AgentProvider — loadOlderMessages", () => {
  it("calls fetchMessages with before cursor from oldest message", async () => {
    const olderMessages = [msg("m0", "older")];
    const fetchMessages = vi
      .fn()
      .mockResolvedValueOnce([msg("m1", "first"), msg("m2", "second")]) // initial
      .mockResolvedValueOnce(olderMessages); // pagination

    mockChat.rawMessages = [msg("m1", "first"), msg("m2", "second")];

    const { contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await contextRef.current?.loadOlderMessages();
    });

    expect(fetchMessages).toHaveBeenCalledWith("t-1", { before: "m1" });
  });

  it("does nothing if no fetchMessages provided", async () => {
    const { contextRef } = renderWithAgent({ threadId: "t-1" });

    await act(async () => {
      await flushPromises();
    });

    // Should not throw
    await act(async () => {
      await contextRef.current?.loadOlderMessages();
    });
  });

  it("does nothing if there are no messages", async () => {
    const fetchMessages = vi.fn().mockResolvedValue([]);
    mockChat.rawMessages = [];

    const { contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    fetchMessages.mockClear();

    await act(async () => {
      await contextRef.current?.loadOlderMessages();
    });

    // Should not call fetchMessages for pagination
    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it("prepends older messages to existing messages", async () => {
    const fetchMessages = vi
      .fn()
      .mockResolvedValueOnce([msg("m2", "second")]) // initial load
      .mockResolvedValueOnce([msg("m0", "zero"), msg("m1", "first")]); // older

    mockChat.rawMessages = [msg("m2", "second")];

    const { contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    mockSetMessages.mockClear();

    await act(async () => {
      await contextRef.current?.loadOlderMessages();
    });

    // Should prepend older messages
    expect(mockSetMessages).toHaveBeenCalledWith([
      msg("m0", "zero"),
      msg("m1", "first"),
      msg("m2", "second"),
    ]);
  });

  it("does not set messages if fetch returns empty", async () => {
    const fetchMessages = vi
      .fn()
      .mockResolvedValueOnce([msg("m1", "first")]) // initial
      .mockResolvedValueOnce([]); // no older messages

    mockChat.rawMessages = [msg("m1", "first")];

    const { contextRef } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    mockSetMessages.mockClear();

    await act(async () => {
      await contextRef.current?.loadOlderMessages();
    });

    expect(mockSetMessages).not.toHaveBeenCalled();
  });

  it("discards results if thread changed during fetch", async () => {
    const resolvers: Array<(msgs: UIMessage[]) => void> = [];
    const paginationPromise = new Promise<UIMessage[]>((r) => {
      resolvers.push(r);
    });

    const fetchMessages = vi
      .fn()
      .mockResolvedValueOnce([msg("m1", "first")]) // initial t-1
      .mockReturnValueOnce(paginationPromise) // older for t-1, will be slow
      .mockResolvedValueOnce([msg("m5", "other")]); // initial t-2

    mockChat.rawMessages = [msg("m1", "first")];

    const { contextRef, rerender } = renderWithAgent({
      threadId: "t-1",
      fetchMessages,
    });

    await act(async () => {
      await flushPromises();
    });

    mockSetMessages.mockClear();

    // Start loading older messages
    let loadPromise: Promise<void> | undefined;
    act(() => {
      loadPromise = contextRef.current?.loadOlderMessages();
    });

    // Switch thread before pagination resolves
    rerender(
      <AgentProvider
        api="/api/chat"
        threadId="t-2"
        fetchMessages={fetchMessages}
      >
        <ContextCapture contextRef={contextRef} />
      </AgentProvider>,
    );

    await act(async () => {
      await flushPromises();
    });

    mockSetMessages.mockClear();

    // Now resolve the stale pagination
    await act(async () => {
      resolvers[0]([msg("m0", "stale-older")]);
      await loadPromise;
    });

    // Should NOT have called setMessages with stale data
    const calls = mockSetMessages.mock.calls.filter((c) => c[0].length > 0);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Helper component that captures context into a ref for assertions */
function ContextCapture({
  contextRef,
}: {
  contextRef: { current: ReturnType<typeof useAgent> | null };
}) {
  contextRef.current = useAgent();
  return null;
}

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}
