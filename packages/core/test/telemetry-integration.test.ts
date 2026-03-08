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
import type { Middleware } from "../src/middleware/core";
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

/** Get all finished spans. */
function getAllSpans() {
  return exporter.getFinishedSpans();
}

/** Get all finished spans, filtering to AI SDK spans only. */
function getAISpans() {
  return getAllSpans().filter((s) => s.name.startsWith("ai."));
}

/** Get all ZAIKit custom spans (agent run, step, middleware, resume). */
function getZaikitSpans() {
  return getAllSpans().filter(
    (s) =>
      s.name.startsWith("agent run") ||
      s.name.startsWith("agent step") ||
      s.name.startsWith("middleware") ||
      s.name.startsWith("resume"),
  );
}

/** Get agent run spans. */
function getRunSpans() {
  return getAllSpans().filter((s) => s.name.startsWith("agent run"));
}

/** Get agent step spans. */
function getStepSpans() {
  return getAllSpans().filter((s) => s.name.startsWith("agent step"));
}

/** Get middleware spans. */
function getMiddlewareSpans() {
  return getAllSpans().filter((s) => s.name.startsWith("middleware:"));
}

/** Get resume spans. */
function getResumeSpans() {
  return getAllSpans().filter((s) => s.name.startsWith("resume:"));
}

/** Check if span A is a direct parent of span B. */
function isParentOf(
  parent: { spanContext: () => { spanId: string } },
  child: { parentSpanContext?: { spanId?: string } },
) {
  return child.parentSpanContext?.spanId === parent.spanContext().spanId;
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

// --- Custom ZAIKit span tests ---

describe("custom zaikit spans", () => {
  it("emits no zaikit spans when telemetry is disabled", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello")]),
    });
    await agent.generate({ prompt: "Hi" });
    expect(getZaikitSpans()).toHaveLength(0);
  });

  it("emits zaikit.agent.run span wrapping ai.streamText", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const runSpans = getRunSpans();
    expect(runSpans).toHaveLength(1);

    const run = runSpans[0];
    expect(run.attributes["zaikit.agent.name"]).toBe("my-agent");

    // ai.streamText should be a descendant of zaikit.agent.run
    const aiRoot = getRootSpan();
    expect(aiRoot).toBeDefined();
    // The ai.streamText span's parent chain should trace back to the run span
    // (may be indirect through step spans)
    expect(run.spanContext().traceId).toBe(aiRoot!.spanContext().traceId);
  });

  it("zaikit.agent.run carries thread_id and user_id", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
      threadId: "thread-1",
      userId: "user-1",
    });
    await drain(stream);
    await result;

    const run = getRunSpans()[0];
    expect(run.attributes["zaikit.agent.thread_id"]).toBe("thread-1");
    expect(run.attributes["zaikit.agent.user_id"]).toBe("user-1");
  });

  it("zaikit.agent.run sets final attributes from result", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const run = getRunSpans()[0];
    expect(run.attributes["zaikit.agent.step_count"]).toBe(1);
    expect(run.attributes["zaikit.agent.finish_reason"]).toBe("stop");
  });

  it("emits zaikit.agent.step spans per step", async () => {
    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `72°F in ${input.city}`,
    });

    const agent = createAgent({
      name: "step-agent",
      model: mockModel([
        toolCallResponse("call-1", "weather", { city: "NYC" }),
        textResponse("It's 72°F"),
      ]),
      tools: { weather: weatherTool },
      telemetry: true,
    });
    await agent.generate({ prompt: "Weather?" });

    const stepSpans = getStepSpans();
    expect(stepSpans).toHaveLength(2);

    // Steps are numbered
    const stepNumbers = stepSpans
      .map((s) => s.attributes["zaikit.step.number"])
      .sort();
    expect(stepNumbers).toEqual([0, 1]);
  });

  it("zaikit.agent.step is child of zaikit.agent.run", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const run = getRunSpans()[0];
    const steps = getStepSpans();
    expect(steps).toHaveLength(1);

    // Step's parent chain should lead to run.
    // With middleware, step may be nested under middleware spans,
    // but they all share the same trace.
    expect(steps[0].spanContext().traceId).toBe(run.spanContext().traceId);
  });

  it("ai.streamText is child of zaikit.agent.step", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const step = getStepSpans()[0];
    const aiRoot = getRootSpan();
    expect(aiRoot).toBeDefined();
    // ai.streamText should be a direct child of the step span
    expect(isParentOf(step, aiRoot!)).toBe(true);
  });

  it("zaikit.middleware spans nest correctly", async () => {
    const outerMw: Middleware = {
      name: "outer",
      handler: (ctx, next) => next(),
    };
    const innerMw: Middleware = {
      name: "inner",
      handler: (ctx, next) => next(),
    };

    const agent = createAgent({
      name: "mw-agent",
      model: mockModel([textResponse("Hello")]),
      middleware: [outerMw, innerMw],
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const mwSpans = getMiddlewareSpans();
    expect(mwSpans).toHaveLength(2);

    const outer = mwSpans.find(
      (s) => s.attributes["zaikit.middleware.name"] === "outer",
    );
    const inner = mwSpans.find(
      (s) => s.attributes["zaikit.middleware.name"] === "inner",
    );
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // Inner middleware should be a child of outer middleware
    expect(isParentOf(outer!, inner!)).toBe(true);

    // Outer middleware index is 0, inner is 1
    expect(outer!.attributes["zaikit.middleware.index"]).toBe(0);
    expect(inner!.attributes["zaikit.middleware.index"]).toBe(1);
  });

  it("unnamed middleware falls back to index-based name", async () => {
    const mw: Middleware = (ctx, next) => next();

    const agent = createAgent({
      name: "mw-agent",
      model: mockModel([textResponse("Hello")]),
      middleware: [mw],
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const mwSpans = getMiddlewareSpans();
    expect(mwSpans).toHaveLength(1);
    expect(mwSpans[0].attributes["zaikit.middleware.name"]).toBe(
      "middleware-0",
    );
  });

  it("full span hierarchy: run > middleware > step > ai.streamText", async () => {
    const mw: Middleware = {
      name: "passthrough",
      handler: (ctx, next) => next(),
    };

    const agent = createAgent({
      name: "full-agent",
      model: mockModel([textResponse("Hello")]),
      middleware: [mw],
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const run = getRunSpans()[0];
    const mwSpan = getMiddlewareSpans()[0];
    const step = getStepSpans()[0];
    const aiRoot = getRootSpan();

    expect(run).toBeDefined();
    expect(mwSpan).toBeDefined();
    expect(step).toBeDefined();
    expect(aiRoot).toBeDefined();

    // run > middleware > step > ai.streamText
    expect(isParentOf(run, mwSpan)).toBe(true);
    expect(isParentOf(mwSpan, step)).toBe(true);
    expect(isParentOf(step, aiRoot!)).toBe(true);
  });

  it("no zaikit spans when telemetry is explicitly false", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: false,
    });
    await agent.generate({ prompt: "Hi" });
    expect(getZaikitSpans()).toHaveLength(0);
  });

  it("per-request telemetry: false disables zaikit spans", async () => {
    const agent = createAgent({
      name: "my-agent",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi", telemetry: false });
    expect(getZaikitSpans()).toHaveLength(0);
  });

  it("multi-step run has correct step_count on run span", async () => {
    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `72°F in ${input.city}`,
    });

    const agent = createAgent({
      name: "multi-step",
      model: mockModel([
        toolCallResponse("call-1", "weather", { city: "NYC" }),
        toolCallResponse("call-2", "weather", { city: "LA" }),
        textResponse("Done"),
      ]),
      tools: { weather: weatherTool },
      telemetry: true,
    });
    await agent.generate({ prompt: "Weather?" });

    const run = getRunSpans()[0];
    expect(run.attributes["zaikit.agent.step_count"]).toBe(3);

    const steps = getStepSpans();
    expect(steps).toHaveLength(3);
  });
});

// --- Suspension & resume telemetry tests ---

describe("suspension telemetry", () => {
  const confirmTool = createTool({
    description: "Ask for confirmation",
    inputSchema: z.object({ action: z.string() }),
    suspendSchema: z.object({ prompt: z.string() }),
    resumeSchema: z.object({ confirmed: z.boolean() }),
    execute: async ({ input, suspend, resumeData }) => {
      if (!resumeData) {
        return suspend({ prompt: `Confirm: ${input.action}?` });
      }
      return resumeData.confirmed ? "Done" : "Cancelled";
    },
  });

  it("step span has suspension attributes when tool suspends", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "suspend-agent",
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
      ]),
      tools: { confirm: confirmTool },
      memory,
      telemetry: true,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy"),
    });

    const steps = getStepSpans();
    expect(steps).toHaveLength(1);

    const step = steps[0];
    expect(step.attributes["zaikit.step.suspended"]).toBe(true);
    expect(step.attributes["zaikit.step.suspended_tool"]).toBe("confirm");
    const payload = JSON.parse(
      step.attributes["zaikit.step.suspend_payload"] as string,
    );
    expect(payload.prompt).toBe("Confirm: deploy?");
  });

  it("run span shows suspended finish_reason", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "suspend-agent",
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
      ]),
      tools: { confirm: confirmTool },
      memory,
      telemetry: true,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy"),
    });

    const run = getRunSpans()[0];
    expect(run.attributes["zaikit.agent.finish_reason"]).toBe("suspended");
  });

  it("ai.toolCall span has zaikit.tool.suspended attributes", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "suspend-agent",
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
      ]),
      tools: { confirm: confirmTool },
      memory,
      telemetry: true,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy"),
    });

    const toolCallSpan = getAllSpans().find(
      (s) =>
        s.name.startsWith("ai.toolCall") &&
        s.attributes["ai.toolCall.name"] === "confirm",
    );
    expect(toolCallSpan).toBeDefined();
    expect(toolCallSpan!.attributes["zaikit.tool.suspended"]).toBe(true);
    const payload = JSON.parse(
      toolCallSpan!.attributes["zaikit.tool.suspend_payload"] as string,
    );
    expect(payload.prompt).toBe("Confirm: deploy?");
  });

  it("resume span has correct attributes on successful resume", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "resume-agent",
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
        textResponse("Deployed!"),
      ]),
      tools: { confirm: confirmTool },
      memory,
      telemetry: true,
    });

    // Suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy"),
    });
    exporter.reset();

    // Resume
    const response = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "call-1", data: { confirmed: true } },
    });
    await response.text();

    const resumeSpans = getResumeSpans();
    expect(resumeSpans).toHaveLength(1);

    const span = resumeSpans[0];
    expect(span.name).toBe("resume: 'confirm'");
    expect(span.attributes["zaikit.resume.tool_call_id"]).toBe("call-1");
    expect(span.attributes["zaikit.resume.tool_name"]).toBe("confirm");
    expect(span.attributes["zaikit.resume.re_suspended"]).toBe(false);

    // Resume data should be the user's response
    const resumeData = JSON.parse(
      span.attributes["zaikit.resume.data"] as string,
    );
    expect(resumeData).toEqual({ confirmed: true });

    // Output should be the tool's final result
    const output = JSON.parse(
      span.attributes["zaikit.resume.output"] as string,
    );
    expect(output).toBe("Done");
  });

  it("resume span has suspend_payload when tool re-suspends", async () => {
    let callCount = 0;
    const multiSuspendTool = createTool({
      description: "Multi-step confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ step: z.number() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ suspend, resumeData }) => {
        callCount++;
        if (!resumeData) return suspend({ step: 1 });
        if (callCount <= 2) return suspend({ step: 2 });
        return "Complete";
      },
    });

    const memory = createInMemoryMemory();
    const agent = createAgent({
      name: "resuspend-agent",
      model: mockModel([
        toolCallResponse("call-1", "multi", { action: "go" }),
        textResponse("All done"),
      ]),
      tools: { multi: multiSuspendTool },
      memory,
      telemetry: true,
    });

    // Initial suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Go"),
    });
    exporter.reset();

    // Resume → re-suspends
    const response = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "call-1", data: { ok: true } },
    });
    await response.text();

    const resumeSpans = getResumeSpans();
    expect(resumeSpans).toHaveLength(1);

    const span = resumeSpans[0];
    expect(span.attributes["zaikit.resume.re_suspended"]).toBe(true);
    const payload = JSON.parse(
      span.attributes["zaikit.resume.suspend_payload"] as string,
    );
    expect(payload.step).toBe(2);

    // Should NOT have resume.output (it re-suspended)
    expect(span.attributes["zaikit.resume.output"]).toBeUndefined();
  });

  it("step span has suspended: false for non-suspending steps", async () => {
    const agent = createAgent({
      name: "no-suspend",
      model: mockModel([textResponse("Hello")]),
      telemetry: true,
    });
    await agent.generate({ prompt: "Hi" });

    const step = getStepSpans()[0];
    expect(step.attributes["zaikit.step.suspended"]).toBe(false);
    expect(step.attributes["zaikit.step.suspended_tool"]).toBeUndefined();
  });
});
