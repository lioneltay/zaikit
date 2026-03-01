import { createInMemoryMemory } from "@zaikit/memory-inmemory";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "../src/agent";
import { createTool } from "../src/create-tool";
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

  it("returns 204 when resuming one of multiple suspended tools", async () => {
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

    // Resume first tool → should return 204 (remaining suspension)
    const firstResume = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c1", data: { ok: true } },
    });
    expect(firstResume.status).toBe(204);

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

    // Resume only the first tool
    const firstResume = await agent.chat({
      threadId: "t1",
      resume: { toolCallId: "c1", data: { ok: true } },
    });
    expect(firstResume.status).toBe(204);

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
