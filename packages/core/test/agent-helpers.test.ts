import { DATA_TOOL_SUSPEND } from "@zaikit/utils";
import { describe, expect, it } from "vitest";
import {
  buildDynamicTools,
  hasUnresolvedSuspensions,
  mergeCallbacks,
} from "../src/agent-helpers";

describe("hasUnresolvedSuspensions", () => {
  const makeSuspend = (
    toolCallId: string,
    resolved = false,
  ): {
    type: typeof DATA_TOOL_SUSPEND;
    id: string;
    data: { toolCallId: string; resolved?: boolean };
  } => ({
    type: DATA_TOOL_SUSPEND,
    id: toolCallId,
    data: { toolCallId, ...(resolved && { resolved: true }) },
  });

  it("returns false for empty array", () => {
    expect(hasUnresolvedSuspensions([])).toBe(false);
  });

  it("returns false when no suspend parts exist", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "tool-invocation", toolCallId: "tc-1" },
    ];
    expect(hasUnresolvedSuspensions(parts)).toBe(false);
  });

  it("returns true for unresolved suspension", () => {
    expect(hasUnresolvedSuspensions([makeSuspend("tc-1")])).toBe(true);
  });

  it("returns false when all suspensions are resolved", () => {
    const parts = [makeSuspend("tc-1", true), makeSuspend("tc-2", true)];
    expect(hasUnresolvedSuspensions(parts)).toBe(false);
  });

  it("returns true when at least one suspension is unresolved", () => {
    const parts = [makeSuspend("tc-1", true), makeSuspend("tc-2", false)];
    expect(hasUnresolvedSuspensions(parts)).toBe(true);
  });

  it("ignores non-suspend parts mixed with suspensions", () => {
    const parts = [
      { type: "text", text: "hello" },
      makeSuspend("tc-1", true),
      { type: "tool-invocation", toolCallId: "tc-2" },
    ];
    expect(hasUnresolvedSuspensions(parts)).toBe(false);
  });
});

describe("mergeCallbacks", () => {
  it("returns undefined when both are undefined", () => {
    expect(mergeCallbacks(undefined, undefined)).toBeUndefined();
  });

  it("returns first when second is undefined", () => {
    const a = () => {};
    expect(mergeCallbacks(a, undefined)).toBe(a);
  });

  it("returns second when first is undefined", () => {
    const b = () => {};
    expect(mergeCallbacks(undefined, b)).toBe(b);
  });

  it("calls both in order: first then second", () => {
    const order: string[] = [];
    const a = () => order.push("a");
    const b = () => order.push("b");
    const merged = mergeCallbacks(a, b)!;

    merged("arg");
    expect(order).toEqual(["a", "b"]);
  });

  it("passes argument to both callbacks", () => {
    const received: number[] = [];
    const a = (n: number) => received.push(n);
    const b = (n: number) => received.push(n * 10);
    const merged = mergeCallbacks(a, b)!;

    merged(5);
    expect(received).toEqual([5, 50]);
  });
});

describe("buildDynamicTools", () => {
  it("returns empty object for empty array", () => {
    expect(buildDynamicTools([])).toEqual({});
  });

  it("creates tool with description and parameters", () => {
    const tools = buildDynamicTools([
      {
        name: "confirm",
        description: "Ask for confirmation",
        parameters: {
          type: "object",
          properties: { message: { type: "string" } },
        },
      },
    ]);

    expect(tools.confirm).toBeDefined();
    expect(tools.confirm.execute).toBeUndefined();
  });

  it("strips $schema and additionalProperties from parameters", () => {
    // These fields cause Gemini to reject the tool. buildDynamicTools strips
    // them before passing to the AI SDK's tool(). If stripping fails, tool()
    // would receive the problematic fields.
    const tools = buildDynamicTools([
      {
        name: "test_tool",
        description: "Test",
        parameters: {
          $schema: "http://json-schema.org/draft-07/schema#",
          additionalProperties: false,
          type: "object",
          properties: { x: { type: "number" } },
        },
      },
    ]);

    // Tool created successfully — the stripped fields didn't cause an error
    expect(tools.test_tool).toBeDefined();
    // Frontend tools have no execute
    expect(tools.test_tool.execute).toBeUndefined();
  });

  it("creates multiple tools", () => {
    const tools = buildDynamicTools([
      {
        name: "tool_a",
        description: "A",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "tool_b",
        description: "B",
        parameters: { type: "object", properties: {} },
      },
    ]);

    expect(Object.keys(tools)).toEqual(["tool_a", "tool_b"]);
  });
});
