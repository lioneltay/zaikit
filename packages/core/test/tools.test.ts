import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../src/create-tool";
import { hasSuspendedTool } from "../src/stop-conditions";
import { isSuspendResult, SUSPEND_MARKER, suspend } from "../src/suspend";

describe("suspend utilities", () => {
  it("suspend() creates an object with SUSPEND_MARKER", () => {
    const result = suspend({ message: "confirm?" });
    expect(result[SUSPEND_MARKER]).toBe(true);
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

  it("suspendable tool returns output on resume via suspend context", async () => {
    // Import the suspend context helper to simulate resume
    const { runWithSuspendContext } = await import("../src/suspend-context");

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

    const result = await runWithSuspendContext(
      { resumeData: { confirmed: true } },
      () =>
        tool.execute?.(
          { action: "deploy" },
          { toolCallId: "tc-1", messages: [] },
        ),
    );
    expect(result).toBe("done");
  });
});

describe("hasSuspendedTool stop condition", () => {
  it("returns true when last step has a suspended tool result", () => {
    const steps = [
      {
        toolResults: [{ output: suspend("data") }],
      },
    ];
    expect(hasSuspendedTool({ steps } as any)).toBe(true);
  });

  it("returns false when tool results are normal values", () => {
    const steps = [
      {
        toolResults: [{ output: "normal result" }, { output: 42 }],
      },
    ];
    expect(hasSuspendedTool({ steps } as any)).toBe(false);
  });

  it("returns false when steps are empty", () => {
    expect(hasSuspendedTool({ steps: [] } as any)).toBe(false);
  });

  it("returns false when last step has no tool results", () => {
    const steps = [{ toolResults: [] }];
    expect(hasSuspendedTool({ steps } as any)).toBe(false);
  });

  it("only checks the last step", () => {
    const steps = [
      // First step has a suspended tool
      { toolResults: [{ output: suspend("old") }] },
      // Last step has normal output
      { toolResults: [{ output: "normal" }] },
    ];
    expect(hasSuspendedTool({ steps } as any)).toBe(false);
  });
});
