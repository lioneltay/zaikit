import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { createInMemoryMemory } from "@zaikit/memory-inmemory";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/agent";
import { createTool } from "../src/create-tool";
import {
  chatAndConsume,
  drain,
  mockModel,
  textResponse,
  toolCallResponse,
  userMessage,
} from "../src/test/helpers";

// --- OTEL test infrastructure ---
// Tests share a single exporter — vitest runs them sequentially within a file,
// and afterEach resets the exporter, so there's no cross-test contamination.

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

beforeAll(() => {
  provider.register();
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
});

/** Get all finished spans, filtering to AI SDK spans only. */
function getAISpans() {
  return exporter.getFinishedSpans().filter((s) => s.name.startsWith("ai."));
}

/** Get the root `ai.streamText` span (there should be exactly one per agent call). */
function getRootSpan() {
  return getAISpans().find(
    (s) => s.name.startsWith("ai.streamText ") || s.name === "ai.streamText",
  );
}

/** Get all `ai.streamText.doStream` spans (one per LLM step). */
function getDoStreamSpans() {
  return getAISpans().filter((s) =>
    s.name.startsWith("ai.streamText.doStream"),
  );
}

// --- Tests ---

describe("telemetry integration", () => {
  it("emits no spans when telemetry is not configured", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
    });
    const result = await agent.generate({ prompt: "Hi" });
    expect(result.text).toContain("Hello");
    expect(getAISpans()).toHaveLength(0);
  });

  it("emits no spans when telemetry is false", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
      telemetry: false,
    });
    const result = await agent.generate({ prompt: "Hi" });
    expect(result.text).toContain("Hello");
    expect(getAISpans()).toHaveLength(0);
  });

  it("emits spans when telemetry is true", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    const result = await agent.generate({ prompt: "Hi" });
    expect(result.text).toContain("Hello");

    const spans = getAISpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);

    const root = getRootSpan();
    expect(root).toBeDefined();
  });

  it("sets functionId from agent name when telemetry: true", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const root = getRootSpan();
    expect(root).toBeDefined();
    expect(root!.attributes["ai.telemetry.functionId"]).toBe("my-agent");
  });

  it("sets functionId from explicit telemetry config", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
      telemetry: { isEnabled: true, functionId: "custom-fn" },
    });
    await agent.generate({ prompt: "Hi" });

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.functionId"]).toBe("custom-fn");
  });

  it("includes operation.name with functionId", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const root = getRootSpan();
    expect(root!.attributes["operation.name"]).toBe("ai.streamText my-agent");
  });

  it("auto-injects threadId as metadata.sessionId via stream()", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
      threadId: "thread-abc",
    });
    await drain(stream);
    await result;

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.metadata.sessionId"]).toBe(
      "thread-abc",
    );
  });

  it("auto-injects userId as metadata.userId", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
      userId: "user-123",
    });
    await drain(stream);
    await result;

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.metadata.userId"]).toBe("user-123");
  });

  it("auto-injects agentName as metadata.tags", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const root = getRootSpan();
    // Tags are serialized as a JSON array string by the AI SDK
    const tags = root!.attributes["ai.telemetry.metadata.tags"];
    expect(tags).toBeDefined();
    // AI SDK serializes arrays — check it contains our agent name
    const parsed = typeof tags === "string" ? JSON.parse(tags) : tags;
    expect(parsed).toContain("my-agent");
  });

  it("combines all auto-injected metadata on chat()", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "acme-assistant",
      model: mockModel([textResponse("Hello")]),
      memory,
      telemetry: true,
    });
    await chatAndConsume(agent, {
      threadId: "thread-1",
      userId: "user-42",
      message: userMessage("Hi"),
    });

    const root = getRootSpan();
    expect(root).toBeDefined();
    expect(root!.attributes["ai.telemetry.functionId"]).toBe("acme-assistant");
    expect(root!.attributes["ai.telemetry.metadata.sessionId"]).toBe(
      "thread-1",
    );
    expect(root!.attributes["ai.telemetry.metadata.userId"]).toBe("user-42");
  });

  it("per-request telemetry: false disables spans", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi", telemetry: false });
    expect(getAISpans()).toHaveLength(0);
  });

  it("per-request telemetry: true enables spans even without agent defaults", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
    });
    await agent.generate({ prompt: "Hi", telemetry: true });

    const spans = getAISpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
  });

  it("per-request telemetry object overrides functionId", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({
      prompt: "Hi",
      telemetry: { functionId: "custom-call" },
    });

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.functionId"]).toBe("custom-call");
  });

  it("user-provided metadata is not overwritten by auto-injection", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: {
        isEnabled: true,
        metadata: { sessionId: "explicit-session", userId: "explicit-user" },
      },
    });
    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
      threadId: "thread-auto",
      userId: "user-auto",
    });
    await drain(stream);
    await result;

    const root = getRootSpan();
    // User-provided values take precedence
    expect(root!.attributes["ai.telemetry.metadata.sessionId"]).toBe(
      "explicit-session",
    );
    expect(root!.attributes["ai.telemetry.metadata.userId"]).toBe(
      "explicit-user",
    );
  });

  it("emits spans for multi-step tool flows", async () => {
    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `72°F in ${input.city}`,
    });

    const agent = createAgent({
      name: "tool-agent",
      model: mockModel([
        toolCallResponse("call-1", "weather", { city: "NYC" }),
        textResponse("It's 72°F"),
      ]),
      tools: { weather: weatherTool },
      telemetry: true,
    });
    await agent.generate({ prompt: "Weather in NYC?" });

    // Should have multiple doStream spans (one per step)
    const doStreamSpans = getDoStreamSpans();
    expect(doStreamSpans.length).toBe(2);

    // All should share the same functionId
    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.functionId"]).toBe("tool-agent");
  });

  it("userId flows through generate()", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi", userId: "gen-user" });

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.metadata.userId"]).toBe("gen-user");
  });

  it("custom metadata merges with auto-injected metadata", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: {
        isEnabled: true,
        metadata: { customKey: "customValue" },
      },
    });
    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
      threadId: "t1",
      userId: "u1",
    });
    await drain(stream);
    await result;

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.metadata.customKey"]).toBe(
      "customValue",
    );
    expect(root!.attributes["ai.telemetry.metadata.sessionId"]).toBe("t1");
    expect(root!.attributes["ai.telemetry.metadata.userId"]).toBe("u1");
  });

  it("telemetry: true without name omits functionId", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const root = getRootSpan();
    expect(root).toBeDefined();
    expect(root!.attributes["ai.telemetry.functionId"]).toBeUndefined();
  });

  it("agent telemetry: false + request telemetry: true enables spans", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
      telemetry: false,
    });
    await agent.generate({ prompt: "Hi", telemetry: true });

    const spans = getAISpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
  });

  it("per-request metadata merges with agent metadata in spans", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: {
        isEnabled: true,
        metadata: { agentMeta: "from-agent" },
      },
    });
    await agent.generate({
      prompt: "Hi",
      telemetry: { metadata: { requestMeta: "from-request" } },
    });

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.metadata.agentMeta"]).toBe(
      "from-agent",
    );
    expect(root!.attributes["ai.telemetry.metadata.requestMeta"]).toBe(
      "from-request",
    );
  });

  it("per-request telemetry override works on chat()", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      memory,
      telemetry: true,
    });
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
      telemetry: { functionId: "chat-override" },
    });

    const root = getRootSpan();
    expect(root!.attributes["ai.telemetry.functionId"]).toBe("chat-override");
  });
});
