import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../src/create-tool";
import { isSuspendResult, suspend } from "../src/suspend";
import { runWithToolInjection } from "../src/tool-injection";

describe("suspend utilities", () => {
  it("suspend() creates a result recognized by isSuspendResult with the given payload", () => {
    const result = suspend({ message: "confirm?" });
    expect(isSuspendResult(result)).toBe(true);
    expect(result.payload).toEqual({ message: "confirm?" });
  });

  it("isSuspendResult() returns true for suspend results", () => {
    expect(isSuspendResult(suspend("data"))).toBe(true);
  });

  it("isSuspendResult() returns false for non-suspend values", () => {
    expect(isSuspendResult(null)).toBe(false);
    expect(isSuspendResult(undefined)).toBe(false);
    expect(isSuspendResult("string")).toBe(false);
    expect(isSuspendResult(42)).toBe(false);
    expect(isSuspendResult({})).toBe(false);
    expect(isSuspendResult({ payload: "data" })).toBe(false);
  });
});

describe("createTool", () => {
  it("regular tool executes and returns output", async () => {
    const tool = createTool({
      description: "Add two numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ input }) => input.a + input.b,
    });

    const result = await tool.execute?.(
      { a: 3, b: 7 },
      { toolCallId: "tc-1", messages: [] },
    );
    expect(result).toBe(10);
  });

  it("suspendable tool returns SuspendResult on first call", async () => {
    const tool = createTool({
      description: "Confirm action",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, suspend, resumeData }) => {
        if (!resumeData) {
          return suspend({ prompt: `Confirm: ${input.action}?` });
        }
        return resumeData.confirmed ? "done" : "cancelled";
      },
    });

    const result = await tool.execute?.(
      { action: "deploy" },
      { toolCallId: "tc-1", messages: [] },
    );
    expect(isSuspendResult(result)).toBe(true);
    expect((result as any).payload).toEqual({ prompt: "Confirm: deploy?" });
  });

  it("suspendable tool returns output on resume", async () => {
    const tool = createTool({
      description: "Confirm action",
      inputSchema: z.object({ action: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ resumeData }) => {
        if (!resumeData) {
          throw new Error("Expected resumeData");
        }
        return resumeData.confirmed ? "done" : "cancelled";
      },
    });

    const result = await runWithToolInjection(
      { resumeData: { confirmed: true } },
      () =>
        tool.execute?.(
          { action: "deploy" },
          { toolCallId: "tc-1", messages: [] },
        ),
    );
    expect(result).toBe("done");
  });

  it("tool with context receives context from AsyncLocalStorage", async () => {
    const tool = createTool({
      description: "Greet user",
      inputSchema: z.object({ greeting: z.string() }),
      context: z.object({ userId: z.string(), org: z.string() }),
      execute: async ({ input, context }) => {
        return `${input.greeting}, ${context.userId} from ${context.org}`;
      },
    });

    const result = await runWithToolInjection(
      { context: { userId: "user-1", org: "acme" } },
      () =>
        tool.execute?.(
          { greeting: "Hello" },
          { toolCallId: "tc-1", messages: [] },
        ),
    );
    expect(result).toBe("Hello, user-1 from acme");
  });

  it("tool without context works unchanged when agent has context", async () => {
    const tool = createTool({
      description: "Add numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ input }) => input.a + input.b,
    });

    // Context is set but tool doesn't declare one — should not receive it
    const result = await runWithToolInjection(
      { context: { userId: "user-1" } },
      () =>
        tool.execute?.({ a: 5, b: 3 }, { toolCallId: "tc-1", messages: [] }),
    );
    expect(result).toBe(8);
  });

  it("suspendable tool with context receives both context and resumeData", async () => {
    const tool = createTool({
      description: "Confirm with context",
      inputSchema: z.object({ action: z.string() }),
      context: z.object({ userId: z.string() }),
      suspendSchema: z.object({ prompt: z.string() }),
      resumeSchema: z.object({ confirmed: z.boolean() }),
      execute: async ({ input, context, resumeData, suspend }) => {
        if (!resumeData) {
          return suspend({
            prompt: `${context.userId}: confirm ${input.action}?`,
          });
        }
        return `${context.userId}: ${resumeData.confirmed ? "done" : "cancelled"}`;
      },
    });

    // First call — should suspend
    const suspendResult = await runWithToolInjection(
      { context: { userId: "user-1" } },
      () =>
        tool.execute?.(
          { action: "deploy" },
          { toolCallId: "tc-1", messages: [] },
        ),
    );
    expect(isSuspendResult(suspendResult)).toBe(true);
    expect((suspendResult as any).payload).toEqual({
      prompt: "user-1: confirm deploy?",
    });

    // Resume — both context and resumeData in one injection
    const resumeResult = await runWithToolInjection(
      { context: { userId: "user-1" }, resumeData: { confirmed: true } },
      () =>
        tool.execute?.(
          { action: "deploy" },
          { toolCallId: "tc-1", messages: [] },
        ),
    );
    expect(resumeResult).toBe("user-1: done");
  });
});
