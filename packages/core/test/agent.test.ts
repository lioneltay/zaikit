import { createInMemoryMemory } from "@zaikit/memory-inmemory";
import type { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  AfterStepContext,
  AfterToolCallContext,
  BeforeToolCallContext,
} from "../src/agent";
import { createAgent } from "../src/agent";
import { createTool } from "../src/create-tool";
import type { Middleware } from "../src/middleware/core";
import { mapChunks } from "../src/stream-utils";
import {
  chatAndConsume,
  mockModel,
  multiToolCallResponse,
  textResponse,
  toolCallResponse,
  userMessage,
} from "../src/test/helpers";

describe("agent integration tests", () => {
  it("sends a message and receives a text response persisted to memory", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      model: mockModel([textResponse("Hello from the agent!")]),
      memory,
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
    });

    // User message + assistant message
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    const textPart = messages[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toContain(
      "Hello from the agent!",
    );
  });

  it("executes a tool and returns text in multi-step flow", async () => {
    const memory = createInMemoryMemory();

    const weatherTool = createTool({
      description: "Get the weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `72°F in ${input.city}`,
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("call-1", "get_weather", { city: "NYC" }),
        textResponse("The weather in NYC is 72°F."),
      ]),
      tools: { get_weather: weatherTool },
      memory,
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("What's the weather in NYC?"),
    });

    expect(messages).toHaveLength(2);
    const assistantParts = messages[1].parts;
    // Should have tool call + tool result + text
    const textPart = assistantParts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toContain("72°F");
  });

  it("suspends a tool and persists data-tool-suspend to memory", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Ask for confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.confirmed ? "Confirmed" : "Cancelled";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "delete files" }),
      ]),
      tools: { confirm: confirmTool },
      memory,
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Delete my files"),
    });

    expect(messages).toHaveLength(2);
    const assistantParts = messages[1].parts;
    // Should have a data-tool-suspend part
    const suspendPart = assistantParts.find(
      (p) => p.type === "data-tool-suspend",
    );
    expect(suspendPart).toBeDefined();
    expect((suspendPart as any).data.toolCallId).toBe("call-1");
    expect((suspendPart as any).data.payload.prompt).toBe(
      "Confirm: delete files?",
    );
  });

  it("does not persist tool output while suspended", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Ask for confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.confirmed ? "Confirmed" : "Cancelled";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
        textResponse("Done."),
      ]),
      tools: { confirm: confirmTool },
      memory,
    });

    // Suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy"),
    });

    // Inspect memory while still suspended
    const messagesWhileSuspended = await memory.getMessages("t1");
    const assistantParts = messagesWhileSuspended[1].parts;

    // The tool part should have no output
    const toolPart = assistantParts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "call-1",
    );
    expect(toolPart).toBeDefined();
    expect((toolPart as any).state).not.toBe("output-available");
    expect((toolPart as any).output).toBeUndefined();

    // The suspend marker should be present and unresolved
    const suspendPart = assistantParts.find(
      (p) => p.type === "data-tool-suspend",
    );
    expect(suspendPart).toBeDefined();
    expect((suspendPart as any).data.resolved).toBeFalsy();

    // Now resume — output should appear
    const resumeResponse = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "call-1", data: { confirmed: true } },
    });
    await resumeResponse.text();

    const messagesAfterResume = await memory.getMessages("t1");
    const resumedToolPart = messagesAfterResume[1].parts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "call-1",
    );
    expect((resumedToolPart as any).state).toBe("output-available");
    expect((resumedToolPart as any).output).toBe("Confirmed");
  });

  it("resumes a suspended tool and continues the LLM", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Ask for confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.confirmed ? "Action confirmed" : "Action cancelled";
      },
    });

    // Step 1: tool call that suspends
    // Step 2: after resume, LLM produces text
    const agent = createAgent({
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
        textResponse("Deployment confirmed and initiated."),
      ]),
      tools: { confirm: confirmTool },
      memory,
    });

    // First chat: tool suspends
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy the app"),
    });

    // Resume with confirmation
    const resumeResponse = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "call-1", data: { confirmed: true } },
    });
    await resumeResponse.text();

    const messages = await memory.getMessages("t1");
    expect(messages).toHaveLength(2);

    // The assistant message should now have the tool output and follow-up text
    const assistantParts = messages[1].parts;
    const textPart = assistantParts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toContain("confirmed");
  });

  it("resumes a suspended tool with rejection", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Ask for confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.confirmed ? "Action confirmed" : "Action cancelled";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "delete" }),
        textResponse("Deletion was cancelled."),
      ]),
      tools: { confirm: confirmTool },
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Delete everything"),
    });

    // Resume with rejection
    const resumeResponse = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "call-1", data: { confirmed: false } },
    });
    await resumeResponse.text();

    const messages = await memory.getMessages("t1");
    const assistantParts = messages[1].parts;

    // Tool output should reflect the rejection
    const toolPart = assistantParts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "call-1",
    );
    expect((toolPart as any).state).toBe("output-available");
    expect((toolPart as any).output).toBe("Action cancelled");
  });

  it("handles multiple tool calls in one step", async () => {
    const memory = createInMemoryMemory();

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `${input.city}: sunny`,
    });

    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "weather", args: { city: "NYC" } },
          { toolCallId: "c2", toolName: "weather", args: { city: "LA" } },
        ]),
        textResponse("NYC is sunny, LA is sunny."),
      ]),
      tools: { weather: weatherTool },
      memory,
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Weather in NYC and LA?"),
    });

    expect(messages).toHaveLength(2);
    const textPart = messages[1].parts.find((p) => p.type === "text");
    expect((textPart as { text: string }).text).toContain("sunny");
  });

  it("creates a thread if it does not exist", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      model: mockModel([textResponse("Hi")]),
      memory,
    });

    // Thread "t1" doesn't exist yet
    const threadBefore = await memory.getThread("t1");
    expect(threadBefore).toBeNull();

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hello"),
    });

    const threadAfter = await memory.getThread("t1");
    expect(threadAfter).not.toBeNull();
    expect(threadAfter?.id).toBe("t1");
  });

  it("does not recreate thread if it already exists", async () => {
    const memory = createInMemoryMemory();
    await memory.createThread("t1", "Existing Thread");

    const agent = createAgent({
      model: mockModel([textResponse("Hi")]),
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hello"),
    });

    const thread = await memory.getThread("t1");
    expect(thread?.title).toBe("Existing Thread");
  });

  it("throws when chat is called without memory", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hi")]),
      // No memory
    });

    await expect(
      agent.chat({
        threadId: "t1",
        message: userMessage("Hello"),
      }),
    ).rejects.toThrow("memory");
  });

  it("throws when resuming with no matching suspended tool", async () => {
    const memory = createInMemoryMemory();
    await memory.createThread("t1");
    await memory.addMessage("t1", {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    });

    const dummyTool = createTool({
      description: "dummy",
      inputSchema: z.object({}),
      execute: async () => "ok",
    });

    const agent = createAgent({
      model: mockModel([]),
      tools: { dummy: dummyTool },
      memory,
    });

    await expect(
      agent.chat({
        threadId: "t1",
        resume: { toolCallId: "nonexistent", data: {} },
      }),
    ).rejects.toThrow("No suspended tool found");
  });

  it("sets ownerId on thread when provided", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      model: mockModel([textResponse("Hi")]),
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hello"),
      ownerId: "user-42",
    });

    const thread = await memory.getThread("t1");
    expect(thread?.ownerId).toBe("user-42");
  });

  it("resumes one of multiple suspended tools without continuing LLM", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Confirm",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.ok ? "confirmed" : "cancelled";
      },
    });

    const approveTool = createTool({
      description: "Approve",
      inputSchema: z.object({ item: z.string() }),
      suspendSchema: z.object({ label: z.string() }),
      resumeSchema: z.object({ approved: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ label: `Approve: ${input.item}?` });
        }
        return resumeData.approved ? "approved" : "rejected";
      },
    });

    // Step 1: two tool calls that both suspend
    // Step 2: after both are resumed, LLM produces text
    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "confirm", args: { action: "deploy" } },
          { toolCallId: "c2", toolName: "approve", args: { item: "budget" } },
        ]),
        textResponse("Both confirmed and approved."),
      ]),
      tools: { confirm: confirmTool, approve: approveTool },
      memory,
    });

    // First chat: both tools suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy and approve budget"),
    });

    const messagesAfterSuspend = await memory.getMessages("t1");
    const suspendParts = messagesAfterSuspend[1].parts.filter(
      (p) => p.type === "data-tool-suspend",
    );
    expect(suspendParts).toHaveLength(2);

    // Resume first tool → still has remaining suspensions, returns stream
    const firstResume = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c1", data: { ok: true } },
    });
    await firstResume.text();

    // Resume second tool → all resolved, LLM continues
    const secondResume = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c2", data: { approved: true } },
    });
    await secondResume.text();

    const finalMessages = await memory.getMessages("t1");
    expect(finalMessages).toHaveLength(2);
    const textPart = finalMessages[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toContain("confirmed");
  });

  it("persists first tool output while second remains suspended", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Confirm",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.ok ? "confirmed" : "cancelled";
      },
    });

    const approveTool = createTool({
      description: "Approve",
      inputSchema: z.object({ item: z.string() }),
      suspendSchema: z.object({ label: z.string() }),
      resumeSchema: z.object({ approved: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ label: `Approve: ${input.item}?` });
        }
        return resumeData.approved ? "approved" : "rejected";
      },
    });

    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "confirm", args: { action: "deploy" } },
          { toolCallId: "c2", toolName: "approve", args: { item: "budget" } },
        ]),
        textResponse("All done."),
      ]),
      tools: { confirm: confirmTool, approve: approveTool },
      memory,
    });

    // Both tools suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy and approve budget"),
    });

    // Resume only the first tool — returns stream (remaining suspensions)
    const firstResume = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c1", data: { ok: true } },
    });
    await firstResume.text();

    // Check memory state between resumes
    const midMessages = await memory.getMessages("t1");
    const midParts = midMessages[1].parts;

    // c1 should be resolved with output
    const c1Tool = midParts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "c1",
    );
    expect((c1Tool as any).state).toBe("output-available");
    expect((c1Tool as any).output).toBe("confirmed");

    const c1Suspend = midParts.find(
      (p) =>
        p.type === "data-tool-suspend" && (p as any).data.toolCallId === "c1",
    );
    expect((c1Suspend as any).data.resolved).toBe(true);

    // c2 should still be suspended with no output
    const c2Tool = midParts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "c2",
    );
    expect((c2Tool as any).state).not.toBe("output-available");
    expect((c2Tool as any).output).toBeUndefined();

    const c2Suspend = midParts.find(
      (p) =>
        p.type === "data-tool-suspend" && (p as any).data.toolCallId === "c2",
    );
    expect((c2Suspend as any).data.resolved).toBeFalsy();
  });

  it("handles frontend tool output and continues the LLM", async () => {
    const memory = createInMemoryMemory();

    // Set up state as if a frontend tool was called and is at input-available.
    // We construct this manually because frontend tools (no execute) require
    // the full SDK message stream pipeline to produce naturally.
    await memory.createThread("t1");
    await memory.addMessage("t1", {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Show me a chart" }],
    });
    await memory.addMessage("t1", {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-chart_renderer",
          toolCallId: "call-1",
          toolName: "chart_renderer",
          input: { data: [1, 2, 3] },
          state: "input-available",
        } as any,
      ],
    });

    const agent = createAgent({
      model: mockModel([textResponse("Here is your chart analysis.")]),
      memory,
    });

    // Submit frontend tool output
    const response = await agent.chat({
      threadId: "t1",
      toolOutputs: [{ toolCallId: "call-1", output: { rendered: true } }],
    });
    await response.text();

    const messages = await memory.getMessages("t1");
    // user + assistant (tool output updated + LLM follow-up appended)
    // The stream appends to the existing assistant message via originalMessages
    expect(messages).toHaveLength(2);

    // The assistant message should have the tool output filled in
    const assistantParts = messages[1].parts;
    const toolPart = assistantParts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "call-1",
    );
    expect((toolPart as any).state).toBe("output-available");
    expect((toolPart as any).output).toEqual({ rendered: true });

    // The same assistant message should also have the LLM's follow-up text
    const textPart = assistantParts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toContain("chart analysis");
  });
});

describe("middleware", () => {
  it("appends system message to ctx.messages before next()", async () => {
    const memory = createInMemoryMemory();
    let capturedMessages: unknown[] = [];

    // Middleware that appends a system message to ctx.messages
    const addSystemReminder: Middleware = (ctx, next) => {
      ctx.messages = [
        ...ctx.messages,
        {
          id: "system-reminder",
          role: "system" as const,
          parts: [{ type: "text", text: "Reminder: be concise" }],
        },
      ];
      capturedMessages = ctx.messages;
      return next();
    };

    const agent = createAgent({
      model: mockModel([textResponse("OK")]),
      system: "You are helpful",
      memory,
      middleware: [addSystemReminder],
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
    });

    expect(capturedMessages).toHaveLength(2); // user message + system reminder
    expect((capturedMessages[1] as any).role).toBe("system");
    expect((capturedMessages[1] as any).parts[0].text).toContain(
      "Reminder: be concise",
    );
  });

  it("transforms output stream via mapChunks", async () => {
    const memory = createInMemoryMemory();

    // Middleware that uppercases text deltas
    const uppercaseMiddleware: Middleware = (_ctx, next) => {
      const stream = next();
      return mapChunks(stream, (chunk: any) => {
        if (chunk.type === "text-delta") {
          return { ...chunk, delta: chunk.delta.toUpperCase() };
        }
        return chunk;
      });
    };

    const agent = createAgent({
      model: mockModel([textResponse("hello world")]),
      memory,
      middleware: [uppercaseMiddleware],
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
    });

    const textPart = messages[1].parts.find((p) => p.type === "text");
    expect((textPart as { text: string }).text).toBe("HELLO WORLD");
  });

  it("executes middleware chain in correct order (outer wraps inner)", async () => {
    const memory = createInMemoryMemory();
    const order: string[] = [];

    const outer: Middleware = (_ctx, next) => {
      order.push("outer-before");
      const stream = next();
      order.push("outer-after");
      return stream;
    };

    const inner: Middleware = (_ctx, next) => {
      order.push("inner-before");
      const stream = next();
      order.push("inner-after");
      return stream;
    };

    const agent = createAgent({
      model: mockModel([textResponse("Hi")]),
      memory,
      middleware: [outer, inner],
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hello"),
    });

    expect(order).toEqual([
      "outer-before",
      "inner-before",
      "inner-after",
      "outer-after",
    ]);
  });

  it("ctx.abort() stops execution and returns abort message as text", async () => {
    const memory = createInMemoryMemory();

    const blockMiddleware: Middleware = (ctx, _next) => {
      ctx.abort("Blocked by policy");
    };

    const agent = createAgent({
      model: mockModel([textResponse("Should not reach")]),
      memory,
      middleware: [blockMiddleware],
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Do something"),
    });

    const textPart = messages[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toBe("Blocked by policy");
  });

  it("middleware that doesn't call next() returns its own stream", async () => {
    const memory = createInMemoryMemory();

    const cacheMiddleware: Middleware = (_ctx, _next) => {
      // Return a "cached" response without calling next()
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "text-start", id: "cached" });
          controller.enqueue({
            type: "text-delta",
            id: "cached",
            delta: "cached response",
          });
          controller.enqueue({ type: "text-end", id: "cached" });
          controller.enqueue({ type: "finish" });
          controller.close();
        },
      });
    };

    const agent = createAgent({
      model: mockModel([textResponse("Should not reach")]),
      memory,
      middleware: [cacheMiddleware],
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
    });

    const textPart = messages[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toBe("cached response");
  });
});

describe("step hooks", () => {
  it("prepareStep fires before each step", async () => {
    const memory = createInMemoryMemory();
    const steps: number[] = [];

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `Sunny in ${input.city}`,
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "weather", { city: "NYC" }),
        textResponse("It's sunny."),
      ]),
      tools: { weather: weatherTool },
      memory,
      prepareStep: ({ stepNumber }) => {
        steps.push(stepNumber);
        return {};
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Weather?"),
    });

    // Step 0: tool call, Step 1: text response
    expect(steps).toEqual([0, 1]);
  });

  it("onAfterStep observes step results", async () => {
    const memory = createInMemoryMemory();
    const afterSteps: { finishReason: string; stepsLength: number }[] = [];

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `Rainy in ${input.city}`,
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "weather", { city: "LA" }),
        textResponse("It's rainy."),
      ]),
      tools: { weather: weatherTool },
      memory,
      onAfterStep: (ctx: AfterStepContext) => {
        afterSteps.push({
          finishReason: ctx.step.finishReason,
          stepsLength: ctx.steps.length,
        });
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Weather?"),
    });

    // Step 0 finishes with tool-calls, step 1 finishes with stop
    // steps accumulates across the loop
    expect(afterSteps).toHaveLength(2);
    expect(afterSteps[0].finishReason).toBe("tool-calls");
    expect(afterSteps[0].stepsLength).toBe(1);
    expect(afterSteps[1].finishReason).toBe("stop");
    expect(afterSteps[1].stepsLength).toBe(2);
  });

  it("onAfterStep can throw to abort the loop", async () => {
    const memory = createInMemoryMemory();
    let toolCallCount = 0;

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => {
        toolCallCount++;
        return `Sunny in ${input.city}`;
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "weather", { city: "NYC" }),
        toolCallResponse("c2", "weather", { city: "LA" }),
        toolCallResponse("c3", "weather", { city: "SF" }),
        textResponse("Done."),
      ]),
      tools: { weather: weatherTool },
      memory,
      onAfterStep: ({ steps }) => {
        if (steps.length >= 2) {
          throw new Error("Max steps reached");
        }
      },
    });

    // The throw aborts the loop — only 2 tool calls should execute
    const response = await agent.chat({
      threadId: "t1",
      message: userMessage("Weather everywhere?"),
    });
    await response.text();

    // Step 0: NYC tool call, Step 1: LA tool call, then onAfterStep throws
    // Step 2 (SF) should never execute
    expect(toolCallCount).toBe(2);
  });

  it("prepareStep overrides are ephemeral (reset each step)", async () => {
    const memory = createInMemoryMemory();
    let toolAExecuteCount = 0;
    let toolBExecuteCount = 0;

    const toolA = createTool({
      description: "Tool A",
      inputSchema: z.object({}),
      execute: async () => {
        toolAExecuteCount++;
        return "a";
      },
    });

    const toolB = createTool({
      description: "Tool B",
      inputSchema: z.object({}),
      execute: async () => {
        toolBExecuteCount++;
        return "b";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "tool_a", {}), // step 0: filtered to tool_a only
        toolCallResponse("c2", "tool_b", {}), // step 1: no filter, tool_b should be available
        textResponse("Done."),
      ]),
      tools: { tool_a: toolA, tool_b: toolB },
      memory,
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0) return { activeTools: ["tool_a"] };
        return {};
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
    });

    // Both tools executed — proving the step 0 filter didn't persist to step 1
    expect(toolAExecuteCount).toBe(1);
    expect(toolBExecuteCount).toBe(1);
  });

  it("prepareStep can filter tools via activeTools", async () => {
    const memory = createInMemoryMemory();
    let toolBExecuted = false;

    const toolA = createTool({
      description: "Tool A",
      inputSchema: z.object({}),
      execute: async () => "a",
    });

    const toolB = createTool({
      description: "Tool B",
      inputSchema: z.object({}),
      execute: async () => {
        toolBExecuted = true;
        return "b";
      },
    });

    const agent = createAgent({
      model: mockModel([
        // Model calls both tools, but only tool_a is allowed
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "tool_a", args: {} },
          { toolCallId: "c2", toolName: "tool_b", args: {} },
        ]),
        textResponse("Done."),
      ]),
      tools: { tool_a: toolA, tool_b: toolB },
      memory,
      prepareStep: () => ({ activeTools: ["tool_a"] }),
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
    });

    // tool_b was filtered out via activeTools, so it should not have executed
    expect(toolBExecuted).toBe(false);
  });

  it("prepareStep receives typed context from agent.chat()", async () => {
    const memory = createInMemoryMemory();
    const receivedContexts: { mode: string; permissions: string[] }[] = [];

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "noop", {}),
        textResponse("Done."),
      ]),
      context: z.object({
        mode: z.string(),
        permissions: z.array(z.string()),
      }),
      tools: {
        noop: createTool({
          description: "No-op",
          inputSchema: z.object({}),
          execute: async () => "ok",
        }),
      },
      memory,
      prepareStep: ({ context }) => {
        receivedContexts.push(context);
        return {};
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
      context: { mode: "copilot", permissions: ["read", "write"] },
    });

    // prepareStep fires for step 0 (tool call) and step 1 (text response)
    expect(receivedContexts).toHaveLength(2);
    expect(receivedContexts[0]).toEqual({
      mode: "copilot",
      permissions: ["read", "write"],
    });
    expect(receivedContexts[1]).toEqual({
      mode: "copilot",
      permissions: ["read", "write"],
    });
  });

  it("prepareStep can use context to filter tools via activeTools", async () => {
    const memory = createInMemoryMemory();
    let toolBExecuted = false;

    const toolA = createTool({
      description: "Tool A",
      inputSchema: z.object({}),
      execute: async () => "a",
    });

    const toolB = createTool({
      description: "Tool B",
      inputSchema: z.object({}),
      execute: async () => {
        toolBExecuted = true;
        return "b";
      },
    });

    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "tool_a", args: {} },
          { toolCallId: "c2", toolName: "tool_b", args: {} },
        ]),
        textResponse("Done."),
      ]),
      context: z.object({ mode: z.enum(["restricted", "full"]) }),
      tools: { tool_a: toolA, tool_b: toolB },
      memory,
      prepareStep: ({ context }) => {
        if (context.mode === "restricted") {
          return { activeTools: ["tool_a"] };
        }
        return {};
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
      context: { mode: "restricted" },
    });

    expect(toolBExecuted).toBe(false);
  });
});

describe("context injection", () => {
  it("passes agent context to tools with matching context schema", async () => {
    const memory = createInMemoryMemory();
    let receivedContext: unknown;

    const settingsTool = createTool({
      description: "Get user settings",
      inputSchema: z.object({}),
      context: z.object({ userId: z.string(), orgId: z.string() }),
      execute: async ({ context }) => {
        receivedContext = context;
        return { theme: "dark" };
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "settings", {}),
        textResponse("Here are your settings."),
      ]),
      context: z.object({ userId: z.string(), orgId: z.string() }),
      tools: { settings: settingsTool },
      memory,
    });

    const response = await agent.chat({
      threadId: "t1",
      message: userMessage("Show settings"),
      context: { userId: "user-1", orgId: "org-1" },
    });
    await response.text();

    expect(receivedContext).toEqual({ userId: "user-1", orgId: "org-1" });
  });

  it("maps agent context to tool context via { tool, mapContext }", async () => {
    const memory = createInMemoryMemory();
    let receivedContext: unknown;

    const activityTool = createTool({
      description: "Get user activity",
      inputSchema: z.object({}),
      context: z.object({ userId: z.string() }),
      execute: async ({ context }) => {
        receivedContext = context;
        return { activities: [] };
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "activity", {}),
        textResponse("Here is your activity."),
      ]),
      context: z.object({ userId: z.string(), orgId: z.string() }),
      tools: {
        activity: {
          tool: activityTool,
          mapContext: (ctx) => ({ userId: ctx.userId }),
        },
      },
      memory,
    });

    const response = await agent.chat({
      threadId: "t1",
      message: userMessage("Show activity"),
      context: { userId: "user-1", orgId: "org-1" },
    });
    await response.text();

    expect(receivedContext).toEqual({ userId: "user-1" });
  });

  it("supports both direct and mapped context tools in the same agent", async () => {
    const memory = createInMemoryMemory();
    let settingsContext: unknown;
    let activityContext: unknown;

    const settingsTool = createTool({
      description: "Get user settings",
      inputSchema: z.object({}),
      context: z.object({ userId: z.string(), orgId: z.string() }),
      execute: async ({ context }) => {
        settingsContext = context;
        return { theme: "dark" };
      },
    });

    const activityTool = createTool({
      description: "Get user activity",
      inputSchema: z.object({}),
      context: z.object({ userId: z.string() }),
      execute: async ({ context }) => {
        activityContext = context;
        return { activities: [] };
      },
    });

    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "settings", args: {} },
          { toolCallId: "c2", toolName: "activity", args: {} },
        ]),
        textResponse("Done."),
      ]),
      context: z.object({ userId: z.string(), orgId: z.string() }),
      tools: {
        settings: settingsTool,
        activity: {
          tool: activityTool,
          mapContext: (ctx) => ({ userId: ctx.userId }),
        },
      },
      memory,
    });

    const response = await agent.chat({
      threadId: "t1",
      message: userMessage("Show everything"),
      context: { userId: "user-1", orgId: "org-1" },
    });
    await response.text();

    // Direct context: receives full agent context
    expect(settingsContext).toEqual({ userId: "user-1", orgId: "org-1" });
    // Mapped context: receives only what mapContext returns
    expect(activityContext).toEqual({ userId: "user-1" });
  });
});

describe("tool-call hooks", () => {
  it("onBeforeToolCall modifies input", async () => {
    const memory = createInMemoryMemory();
    let receivedInput: unknown;

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => {
        receivedInput = input;
        return `Weather for ${input.city}`;
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "weather", { city: "NYC" }),
        textResponse("Done."),
      ]),
      tools: { weather: weatherTool },
      memory,
      onBeforeToolCall: (_ctx: BeforeToolCallContext) => {
        // Override the city
        return { input: { city: "London" } };
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Weather?"),
    });

    expect(receivedInput).toEqual({ city: "London" });
  });

  it("onAfterToolCall modifies output", async () => {
    const memory = createInMemoryMemory();

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `Sunny in ${input.city}`,
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "weather", { city: "NYC" }),
        textResponse("Modified weather."),
      ]),
      tools: { weather: weatherTool },
      memory,
      onAfterToolCall: (ctx: AfterToolCallContext) => {
        // Override the output
        return { output: `MODIFIED: ${ctx.output}` };
      },
    });

    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Weather?"),
    });

    // The tool result in the persisted message should have the modified output
    const assistantParts = messages[1].parts;
    const toolPart = assistantParts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "c1",
    );
    expect((toolPart as any).output).toBe("MODIFIED: Sunny in NYC");
  });

  it("onBeforeToolCall throws to block tool execution", async () => {
    const memory = createInMemoryMemory();
    let toolExecuted = false;

    const dangerousTool = createTool({
      description: "Dangerous operation",
      inputSchema: z.object({ action: z.string() }),
      execute: async () => {
        toolExecuted = true;
        return "executed";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "dangerous", { action: "delete" }),
        textResponse("Tool was blocked."),
      ]),
      tools: { dangerous: dangerousTool },
      memory,
      onBeforeToolCall: (ctx: BeforeToolCallContext) => {
        if (ctx.toolName === "dangerous") {
          throw new Error("Blocked by policy");
        }
      },
    });

    // The tool call should error, but the agent should continue
    // (the SDK handles tool execution errors gracefully)
    const { messages } = await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Do dangerous thing"),
    });

    expect(toolExecuted).toBe(false);
    // The agent should have produced a response (the LLM adapts to the error)
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it("onAfterToolCall observes tool results", async () => {
    const memory = createInMemoryMemory();
    const observed: AfterToolCallContext[] = [];

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `Rainy in ${input.city}`,
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "weather", { city: "Seattle" }),
        textResponse("It's rainy."),
      ]),
      tools: { weather: weatherTool },
      memory,
      onAfterToolCall: (ctx: AfterToolCallContext) => {
        observed.push({ ...ctx });
      },
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Weather?"),
    });

    expect(observed).toHaveLength(1);
    expect(observed[0].toolName).toBe("weather");
    expect(observed[0].input).toEqual({ city: "Seattle" });
    expect(observed[0].output).toBe("Rainy in Seattle");
  });
});

describe("dynamic system prompt", () => {
  it("resolves a function system prompt using context", async () => {
    const memory = createInMemoryMemory();
    const model = mockModel([textResponse("Hi!")]);

    const agent = createAgent({
      model,
      context: z.object({ language: z.string() }),
      system: (ctx) => `Always respond in ${ctx.language}.`,
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hello"),
      context: { language: "French" },
    });

    // Inspect the system prompt sent to the model
    const mockLLM = model as MockLanguageModelV3;
    const call = mockLLM.doStreamCalls[0];
    const systemMessages = call.prompt.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].content).toBe("Always respond in French.");
  });

  it("resolves an async function system prompt", async () => {
    const memory = createInMemoryMemory();
    const model = mockModel([textResponse("Done.")]);

    const agent = createAgent({
      model,
      context: z.object({ tenantId: z.string() }),
      system: async (ctx) => {
        // Simulate async lookup (e.g., fetching tenant-specific instructions)
        return `You are an assistant for tenant ${ctx.tenantId}.`;
      },
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hi"),
      context: { tenantId: "acme" },
    });

    const mockLLM = model as MockLanguageModelV3;
    const call = mockLLM.doStreamCalls[0];
    const systemMessages = call.prompt.filter((m) => m.role === "system");
    expect(systemMessages[0].content).toBe(
      "You are an assistant for tenant acme.",
    );
  });

  it("static string system prompt still works", async () => {
    const memory = createInMemoryMemory();
    const model = mockModel([textResponse("Hi!")]);

    const agent = createAgent({
      model,
      system: "You are helpful.",
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Hello"),
    });

    const mockLLM = model as MockLanguageModelV3;
    const call = mockLLM.doStreamCalls[0];
    const systemMessages = call.prompt.filter((m) => m.role === "system");
    expect(systemMessages[0].content).toBe("You are helpful.");
  });
});

describe("stream()", () => {
  it("returns a stream and result without requiring memory", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello from stream!")]),
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
    });

    // Consume the stream
    const reader = stream.getReader();
    const chunks: unknown[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const agentResult = await result;
    expect(agentResult.text).toBe("Hello from stream!");
    expect(agentResult.finishReason).toBe("stop");
    expect(agentResult.steps).toHaveLength(1);
    expect(agentResult.usage.inputTokens).toBeGreaterThan(0);
  });

  it("runs tools in multi-step flow", async () => {
    let toolExecuted = false;

    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => {
        toolExecuted = true;
        return `72°F in ${input.city}`;
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "get_weather", { city: "NYC" }),
        textResponse("The weather is 72°F."),
      ]),
      tools: { get_weather: weatherTool },
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Weather?")],
    });

    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const agentResult = await result;
    expect(toolExecuted).toBe(true);
    expect(agentResult.text).toBe("The weather is 72°F.");
    expect(agentResult.steps).toHaveLength(2);
  });

  it("accepts a model override", async () => {
    const defaultModel = mockModel([textResponse("default")]);
    const overrideModel = mockModel([textResponse("override")]);

    const agent = createAgent({ model: defaultModel });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
      model: overrideModel,
    });

    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const agentResult = await result;
    expect(agentResult.text).toBe("override");
  });
});

describe("generate()", () => {
  it("returns text from a simple prompt", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("The answer is 42.")]),
    });

    const result = await agent.generate({ prompt: "What is the answer?" });

    expect(result.text).toBe("The answer is 42.");
    expect(result.finishReason).toBe("stop");
    expect(result.steps).toHaveLength(1);
  });

  it("runs tools and returns the final text", async () => {
    const weatherTool = createTool({
      description: "Get weather",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => `72°F in ${input.city}`,
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "get_weather", { city: "NYC" }),
        textResponse("NYC is 72°F."),
      ]),
      tools: { get_weather: weatherTool },
    });

    const result = await agent.generate({ prompt: "Weather in NYC?" });

    expect(result.text).toBe("NYC is 72°F.");
    expect(result.steps).toHaveLength(2);
  });

  it("accepts UIMessage[] instead of prompt", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello back!")]),
    });

    const result = await agent.generate({
      messages: [userMessage("Hello")],
    });

    expect(result.text).toBe("Hello back!");
  });

  it("passes context to tools", async () => {
    let receivedContext: unknown;

    const greetTool = createTool({
      description: "Greet user",
      inputSchema: z.object({}),
      context: z.object({ userName: z.string() }),
      execute: async ({ context }) => {
        receivedContext = context;
        return `Hello ${context.userName}`;
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "greet", {}),
        textResponse("Done."),
      ]),
      context: z.object({ userName: z.string() }),
      tools: { greet: greetTool },
    });

    await agent.generate({
      prompt: "Greet me",
      context: { userName: "Alice" },
    });

    expect(receivedContext).toEqual({ userName: "Alice" });
  });

  it("accepts a per-call model override", async () => {
    const defaultModel = mockModel([textResponse("default")]);
    const overrideModel = mockModel([textResponse("override")]);

    const agent = createAgent({ model: defaultModel });

    const result = await agent.generate({
      prompt: "Hi",
      model: overrideModel,
    });

    expect(result.text).toBe("override");
  });

  it("sums usage across multiple steps", async () => {
    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "noop", {}),
        textResponse("Done."),
      ]),
      tools: {
        noop: createTool({
          description: "No-op",
          inputSchema: z.object({}),
          execute: async () => "ok",
        }),
      },
    });

    const result = await agent.generate({ prompt: "Go" });

    // Each step has 10 input + 5 output tokens (from defaultUsage in helpers)
    expect(result.usage.inputTokens).toBe(20);
    expect(result.usage.outputTokens).toBe(10);
    expect(result.usage.totalTokens).toBe(30);
  });

  it("does not require memory", async () => {
    // Agent has no memory — generate should still work
    const agent = createAgent({
      model: mockModel([textResponse("No memory needed.")]),
    });

    const result = await agent.generate({ prompt: "Hi" });
    expect(result.text).toBe("No memory needed.");
  });

  it("throws on tool suspension", async () => {
    const confirmTool = createTool({
      description: "Ask for confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.confirmed ? "Confirmed" : "Cancelled";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "confirm", { action: "delete" }),
      ]),
      tools: { confirm: confirmTool },
    });

    await expect(agent.generate({ prompt: "Delete it" })).rejects.toThrow(
      "Tool suspension is not supported in generate()",
    );
  });
});

describe("generate() with output", () => {
  it("returns a typed object via output", async () => {
    const agent = createAgent({
      model: mockModel([textResponse('{"title":"Hello","score":42}')]),
    });

    const result = await agent.generate({
      output: z.object({ title: z.string(), score: z.number() }),
      prompt: "Rate this",
    });

    expect(result.output).toEqual({ title: "Hello", score: 42 });
  });

  it("returns undefined output when no output spec provided", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("Hello world")]),
    });

    const result = await agent.generate({ prompt: "Hi" });

    expect(result.output).toBeUndefined();
    expect(result.text).toBe("Hello world");
  });

  it("accepts a per-call model override with output", async () => {
    const defaultModel = mockModel([textResponse('{"name":"Default"}')]);
    const overrideModel = mockModel([textResponse('{"name":"Override"}')]);

    const agent = createAgent({ model: defaultModel });

    const result = await agent.generate({
      output: z.object({ name: z.string() }),
      prompt: "Name something",
      model: overrideModel,
    });

    expect(result.output).toEqual({ name: "Override" });
  });
});

describe("stream() with output", () => {
  it("returns parsed structured output via stream result", async () => {
    const agent = createAgent({
      model: mockModel([textResponse('{"city":"NYC","temp":72}')]),
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Weather?")],
      output: z.object({ city: z.string(), temp: z.number() }),
    });

    // Consume the stream
    for await (const _ of stream as any) {
      // drain
    }

    const agentResult = await result;
    expect(agentResult.output).toEqual({ city: "NYC", temp: 72 });
  });
});

describe("maxSteps enforcement", () => {
  it("stops the loop when maxSteps is reached via stream()", async () => {
    const noopTool = createTool({
      description: "No-op",
      inputSchema: z.object({}),
      execute: async () => "ok",
    });

    // Model calls the tool every time (never stops on its own)
    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "noop", {}),
        toolCallResponse("c2", "noop", {}),
        toolCallResponse("c3", "noop", {}),
        toolCallResponse("c4", "noop", {}),
        toolCallResponse("c5", "noop", {}),
      ]),
      tools: { noop: noopTool },
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Go")],
      maxSteps: 3,
    });

    for await (const _ of stream as any) {
      // drain
    }

    const agentResult = await result;
    // Should only have 3 steps despite 5 responses available
    expect(agentResult.steps).toHaveLength(3);
  });

  it("stops the loop when maxSteps is reached via generate()", async () => {
    const noopTool = createTool({
      description: "No-op",
      inputSchema: z.object({}),
      execute: async () => "ok",
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "noop", {}),
        toolCallResponse("c2", "noop", {}),
        toolCallResponse("c3", "noop", {}),
        toolCallResponse("c4", "noop", {}),
      ]),
      tools: { noop: noopTool },
    });

    const result = await agent.generate({ prompt: "Go", maxSteps: 2 });
    expect(result.steps).toHaveLength(2);
  });
});

describe("context validation", () => {
  it("throws on invalid context", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("ok")]),
      context: z.object({ userId: z.string() }),
    });

    await expect(
      agent.generate({
        prompt: "Hi",
        context: { userId: 123 } as any,
      }),
    ).rejects.toThrow();
  });
});

describe("error propagation", () => {
  it("rejects the result promise when coreAgentStream throws", async () => {
    const agent = createAgent({
      model: mockModel([textResponse("ok")]),
      prepareStep: () => {
        throw new Error("prepareStep exploded");
      },
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Hi")],
    });

    // Consume the stream to trigger the error
    const chunks: unknown[] = [];
    try {
      for await (const chunk of stream as any) {
        chunks.push(chunk);
      }
    } catch {
      // stream will error
    }

    await expect(result).rejects.toThrow("prepareStep exploded");
  });
});

describe("handleToolOutputs 204 path", () => {
  it("returns 204 when backend suspensions remain after frontend tool output", async () => {
    const memory = createInMemoryMemory();

    const backendSuspendTool = createTool({
      description: "Backend suspend",
      inputSchema: z.object({}),
      suspendSchema: z.object({ msg: z.string() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ suspend, resumeData }) => {
        if (!resumeData) return suspend({ msg: "Confirm?" });
        return "done";
      },
    });

    // Step 1: model calls both tools — backend suspends, frontend stays at input-available
    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "backend_suspend", args: {} },
          { toolCallId: "c2", toolName: "chart", args: { data: [1, 2, 3] } },
        ]),
        textResponse("All done."),
      ]),
      tools: { backend_suspend: backendSuspendTool },
      memory,
    });

    const frontendTools = [
      {
        name: "chart",
        description: "Render a chart",
        parameters: { type: "object", properties: { data: { type: "array" } } },
      },
    ];

    // Initial chat — backend tool suspends
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Do both"),
      frontendTools,
    });

    // Submit frontend tool output while backend suspension remains
    const response = await agent.chat({
      threadId: "t1",
      toolOutputs: [{ toolCallId: "c2", output: "chart rendered" }],
      frontendTools,
    });

    expect(response.status).toBe(204);
  });
});

describe("writeData", () => {
  it("tool writeData emits data chunks in stream()", async () => {
    const progressTool = createTool({
      description: "Do work with progress",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "progress", data: { step: 1, total: 2 } });
        writeData({ type: "progress", data: { step: 2, total: 2 } });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "work", {}),
        textResponse("Work complete."),
      ]),
      tools: { work: progressTool },
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Do work")],
    });

    const chunks: any[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }

    const dataChunks = chunks.filter((c) => c.type === "data-progress");
    expect(dataChunks).toHaveLength(2);
    // Wire data uses { toolCallId, payload } envelope for tool-part association
    expect(dataChunks[0].data).toEqual({
      toolCallId: "c1",
      payload: { step: 1, total: 2 },
    });
    expect(dataChunks[1].data).toEqual({
      toolCallId: "c1",
      payload: { step: 2, total: 2 },
    });

    const agentResult = await result;
    expect(agentResult.text).toBe("Work complete.");
  });

  it("writeData auto-generates id when not provided", async () => {
    const tool = createTool({
      description: "Emit data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "status", data: "ok" });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "emit", {}),
        textResponse("Done."),
      ]),
      tools: { emit: tool },
    });

    const { stream } = await agent.stream({
      messages: [userMessage("Go")],
    });

    const chunks: any[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }

    const dataChunk = chunks.find((c) => c.type === "data-status");
    expect(dataChunk).toBeDefined();
    expect(dataChunk.id).toBeDefined();
    expect(typeof dataChunk.id).toBe("string");
  });

  it("writeData preserves user-provided id", async () => {
    const tool = createTool({
      description: "Emit data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "status", data: "ok", id: "my-id" });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "emit", {}),
        textResponse("Done."),
      ]),
      tools: { emit: tool },
    });

    const { stream } = await agent.stream({
      messages: [userMessage("Go")],
    });

    const chunks: any[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }

    const dataChunk = chunks.find((c) => c.type === "data-status");
    expect(dataChunk).toBeDefined();
    expect(dataChunk.id).toBe("my-id");
  });

  it("writeData with transient flag passes through", async () => {
    const tool = createTool({
      description: "Emit data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({
          type: "progress",
          data: { pct: 50 },
          transient: true,
        });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "emit", {}),
        textResponse("Done."),
      ]),
      tools: { emit: tool },
    });

    const { stream } = await agent.stream({
      messages: [userMessage("Go")],
    });

    const chunks: any[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }

    const dataChunk = chunks.find((c) => c.type === "data-progress");
    expect(dataChunk).toBeDefined();
    expect(dataChunk.transient).toBe(true);
  });

  it("onData callback fires on stream()", async () => {
    const receivedParts: any[] = [];

    const tool = createTool({
      description: "Emit data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "status", data: "working" });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "emit", {}),
        textResponse("Done."),
      ]),
      tools: { emit: tool },
    });

    const { stream, result } = await agent.stream({
      messages: [userMessage("Go")],
      onData: (part) => receivedParts.push(part),
    });

    for await (const _ of stream as any) {
      // drain
    }
    await result;

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0].type).toBe("status");
    expect(receivedParts[0].data).toBe("working");
  });

  it("onData callback fires on generate()", async () => {
    const receivedParts: any[] = [];

    const tool = createTool({
      description: "Emit data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "artifact", data: { content: "hello" } });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "emit", {}),
        textResponse("Done."),
      ]),
      tools: { emit: tool },
    });

    await agent.generate({
      prompt: "Go",
      onData: (part) => receivedParts.push(part),
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0].type).toBe("artifact");
    expect(receivedParts[0].data).toEqual({ content: "hello" });
  });

  it("writeData no-ops gracefully outside agent context", async () => {
    const tool = createTool({
      description: "Standalone tool",
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ input, writeData }) => {
        // Should not throw even without agent context
        writeData({ type: "test", data: "hello" });
        return input.x * 2;
      },
    });

    // Direct execution via AI SDK tool.execute (no agent wrapping)
    const result = await tool.execute?.({ x: 5 }, {
      toolCallId: "direct",
      messages: [],
    } as any);
    expect(result).toBe(10);
  });

  it("auto-prefixes data- on the wire", async () => {
    const tool = createTool({
      description: "Emit data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "custom-type", data: "value" });
        // Already prefixed — should not double-prefix
        writeData({ type: "data-already-prefixed", data: "value2" });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "emit", {}),
        textResponse("Done."),
      ]),
      tools: { emit: tool },
    });

    const { stream } = await agent.stream({
      messages: [userMessage("Go")],
    });

    const chunks: any[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }

    const dataChunks = chunks.filter(
      (c) => typeof c.type === "string" && c.type.startsWith("data-"),
    );
    const types = dataChunks.map((c) => c.type);
    expect(types).toContain("data-custom-type");
    expect(types).toContain("data-already-prefixed");
    // Should NOT have data-data-already-prefixed
    expect(types).not.toContain("data-data-already-prefixed");
  });

  it("writeData works during resume", async () => {
    const memory = createInMemoryMemory();

    const confirmTool = createTool({
      description: "Confirm with progress",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData, writeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        writeData({ type: "progress", data: { status: "processing" } });
        return resumeData.confirmed ? "Confirmed" : "Cancelled";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("call-1", "confirm", { action: "deploy" }),
        textResponse("Done."),
      ]),
      tools: { confirm: confirmTool },
      memory,
    });

    // First chat: tool suspends
    await (
      await agent.chat({
        threadId: "t1",
        message: userMessage("Deploy"),
      })
    ).text();

    // Resume — writeData should not crash and data part should be persisted
    const resumeResponse = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "call-1", data: { confirmed: true } },
    });
    await resumeResponse.text();

    const messages = await memory.getMessages("t1");
    const assistantParts = messages[1].parts;

    // The data part from writeData during resume should be persisted
    // Wire data uses { toolCallId, payload } envelope
    const dataPart = assistantParts.find((p) => p.type === "data-progress");
    expect(dataPart).toBeDefined();
    expect((dataPart as any).data).toEqual({
      toolCallId: "call-1",
      payload: { status: "processing" },
    });
  });

  it("writeData with scope 'message' produces no toolCallId envelope", async () => {
    const tool = createTool({
      description: "Emit message-scoped data",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({
          type: "notification",
          data: { msg: "hello" },
          scope: "message",
        });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("c1", "notify", {}),
        textResponse("Done."),
      ]),
      tools: { notify: tool },
    });

    const { stream } = await agent.stream({
      messages: [userMessage("Go")],
    });

    const chunks: any[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }

    const dataChunk = chunks.find((c) => c.type === "data-notification");
    expect(dataChunk).toBeDefined();
    // Message-scoped: data should be the raw payload, no { toolCallId, payload } envelope
    expect(dataChunk.data).toEqual({ msg: "hello" });
    expect(dataChunk.data.toolCallId).toBeUndefined();
  });

  it("invalid writeData scope throws", async () => {
    const tool = createTool({
      description: "Bad scope",
      inputSchema: z.object({}),
      execute: async ({ writeData }) => {
        writeData({ type: "test", data: "x", scope: "invalid" as any });
        return "done";
      },
    });

    // Test at the tool level — the throw happens synchronously in writeData
    await expect(
      tool.execute?.({}, { toolCallId: "tc-1", messages: [] } as any),
    ).rejects.toThrow("Invalid writeData scope");
  });

  it("resume stream sends resolved data-tool-suspend before tool re-execution", async () => {
    const memory = createInMemoryMemory();

    const slowTool = createTool({
      description: "Slow tool with suspend",
      inputSchema: z.object({}),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ suspend, resumeData, writeData }) => {
        if (!resumeData) {
          return suspend({ prompt: "Continue?" });
        }
        // Emit data after resume — the resolved suspend should come BEFORE this
        writeData({ type: "progress", data: "working" });
        return "done";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("tc-1", "slow", {}),
        textResponse("Done."),
      ]),
      tools: { slow: slowTool },
      memory,
    });

    // First chat: tool suspends
    await (
      await agent.chat({
        threadId: "t1",
        message: userMessage("Go"),
      })
    ).text();

    // Resume and collect raw stream chunks
    const resumeResponse = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "tc-1", data: { ok: true } },
    });

    const chunks: any[] = [];
    const reader = resumeResponse.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Parse SSE events
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            chunks.push(JSON.parse(line.slice(6)));
          } catch {
            // skip non-JSON lines
          }
        }
      }
    }

    // Find the resolved suspend and the first data-progress chunk
    const suspendIdx = chunks.findIndex(
      (c) => c.type === "data-tool-suspend" && c.data?.resolved === true,
    );
    const progressIdx = chunks.findIndex((c) => c.type === "data-progress");

    expect(suspendIdx).toBeGreaterThanOrEqual(0);
    // The resolved suspend should come before the progress data from tool re-execution
    if (progressIdx >= 0) {
      expect(suspendIdx).toBeLessThan(progressIdx);
    }
  });

  it("supports multi-suspend: tool suspends twice then returns result", async () => {
    const memory = createInMemoryMemory();

    const multiStepTool = createTool({
      description: "Multi-step confirmation",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ phase: z.string(), prompt: z.string() }),
      resumeSchema: z.object({ value: z.string() }),
      execute: async ({ input, suspend, resumeData, resumeHistory }) => {
        if (resumeHistory.length === 0) {
          return suspend({
            phase: "confirm",
            prompt: `Confirm ${input.action}?`,
          });
        }
        if (resumeHistory.length === 1) {
          return suspend({ phase: "mfa", prompt: "Enter MFA code" });
        }
        return { status: "done", action: input.action, mfa: resumeData?.value };
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("tc-1", "multi", { action: "deploy" }),
        textResponse("All done."),
      ]),
      tools: { multi: multiStepTool },
      memory,
    });

    // Step 1: initial chat — tool suspends with phase "confirm"
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Deploy"),
    });

    let msgs = await memory.getMessages("t1");
    let suspendPart = msgs[1].parts.find(
      (p) => p.type === "data-tool-suspend",
    ) as any;
    expect(suspendPart.data.payload.phase).toBe("confirm");
    expect(suspendPart.data.resumeHistory).toBeUndefined();

    // Step 2: first resume — tool re-suspends with phase "mfa"
    const resume1 = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "tc-1", data: { value: "yes" } },
    });
    await resume1.text();

    msgs = await memory.getMessages("t1");
    suspendPart = msgs[1].parts.find(
      (p) => p.type === "data-tool-suspend",
    ) as any;
    expect(suspendPart.data.payload.phase).toBe("mfa");
    expect(suspendPart.data.resumeHistory).toEqual([{ value: "yes" }]);
    expect(suspendPart.data.resolved).toBeFalsy();

    // Tool part should NOT have output yet
    const toolPart = msgs[1].parts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "tc-1",
    );
    expect((toolPart as any).state).not.toBe("output-available");

    // Step 3: second resume — tool returns result, LLM continues
    const resume2 = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "tc-1", data: { value: "123456" } },
    });
    await resume2.text();

    msgs = await memory.getMessages("t1");
    const finalToolPart = msgs[1].parts.find(
      (p) => "toolCallId" in p && (p as any).toolCallId === "tc-1",
    );
    expect((finalToolPart as any).state).toBe("output-available");
    expect((finalToolPart as any).output).toEqual({
      status: "done",
      action: "deploy",
      mfa: "123456",
    });

    // LLM continuation should have produced text
    const textPart = msgs[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
  });

  it("multi-suspend with other tools still suspended", async () => {
    const memory = createInMemoryMemory();

    const multiTool = createTool({
      description: "Multi-step tool",
      inputSchema: z.object({}),
      suspendSchema: z.object({ step: z.number() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ suspend, resumeHistory }) => {
        if (resumeHistory.length === 0) {
          return suspend({ step: 1 });
        }
        return "done";
      },
    });

    const otherTool = createTool({
      description: "Another suspendable tool",
      inputSchema: z.object({}),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ ok: z.boolean() }),
      execute: async ({ suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: "Approve?" });
        }
        return "approved";
      },
    });

    const agent = createAgent({
      model: mockModel([
        multiToolCallResponse([
          { toolCallId: "c1", toolName: "multi", args: {} },
          { toolCallId: "c2", toolName: "other", args: {} },
        ]),
        textResponse("Both done."),
      ]),
      tools: { multi: multiTool, other: otherTool },
      memory,
    });

    // Both tools suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Do both"),
    });

    // Resume multi tool → it returns result, but other tool still suspended
    const resume1 = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c1", data: { ok: true } },
    });
    await resume1.text();

    // Check: multi tool is resolved, other tool still suspended
    const msgs = await memory.getMessages("t1");
    const suspendParts = msgs[1].parts.filter(
      (p) => p.type === "data-tool-suspend",
    );
    const multiSuspend = suspendParts.find(
      (p) => (p as any).data.toolCallId === "c1",
    );
    const otherSuspend = suspendParts.find(
      (p) => (p as any).data.toolCallId === "c2",
    );
    expect((multiSuspend as any).data.resolved).toBe(true);
    expect((otherSuspend as any).data.resolved).toBeFalsy();

    // Resume other tool → all resolved → LLM continues
    const resume2 = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c2", data: { ok: true } },
    });
    await resume2.text();

    const finalMsgs = await memory.getMessages("t1");
    const textPart = finalMsgs[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
  });

  it("resumeHistory accumulates across multiple re-suspensions", async () => {
    const memory = createInMemoryMemory();
    const historyLog: unknown[][] = [];

    const tool = createTool({
      description: "Three-phase tool",
      inputSchema: z.object({}),
      suspendSchema: z.object({ phase: z.number() }),
      resumeSchema: z.object({ answer: z.string() }),
      execute: async ({ suspend, resumeHistory }) => {
        historyLog.push([...resumeHistory]);
        if (resumeHistory.length < 3) {
          return suspend({ phase: resumeHistory.length + 1 });
        }
        return "complete";
      },
    });

    const agent = createAgent({
      model: mockModel([
        toolCallResponse("tc-1", "tool", {}),
        textResponse("Finished."),
      ]),
      tools: { tool },
      memory,
    });

    // Initial suspend
    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Go"),
    });

    // Resume 3 times
    for (const answer of ["a", "b", "c"]) {
      const res = await agent.chat({
        threadId: "t1",
        resume: { toolCallId: "tc-1", data: { answer } },
      });
      await res.text();
    }

    // Verify the tool saw accumulating history
    expect(historyLog).toEqual([
      [], // initial call
      [{ answer: "a" }], // first resume
      [{ answer: "a" }, { answer: "b" }], // second resume
      [{ answer: "a" }, { answer: "b" }, { answer: "c" }], // third resume
    ]);
  });
});

describe("generateThreadTitle", () => {
  it("generates a title for new threads", async () => {
    const memory = createInMemoryMemory();
    const agent = createAgent({
      model: mockModel([textResponse("Hello!")]),
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Tell me about TypeScript"),
    });

    // Title generation is fire-and-forget — wait for it to complete
    await new Promise((r) => setTimeout(r, 100));

    const thread = await memory.getThread("t1");
    expect(thread?.title).toBe("Generated Title");
  });

  it("does not overwrite an existing title", async () => {
    const memory = createInMemoryMemory();
    await memory.createThread("t1", "My Custom Title");

    const agent = createAgent({
      model: mockModel([textResponse("Hello!")]),
      memory,
    });

    await chatAndConsume(agent, {
      threadId: "t1",
      message: userMessage("Tell me about TypeScript"),
    });

    await new Promise((r) => setTimeout(r, 100));

    const thread = await memory.getThread("t1");
    expect(thread?.title).toBe("My Custom Title");
  });
});
