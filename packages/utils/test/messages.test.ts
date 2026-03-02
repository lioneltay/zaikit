import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  enrichToolPartsWithSuspendData,
  getToolName,
  hasPendingFrontendTools,
  hasSuspendedTools,
  mergeConsecutiveAssistantMessages,
  processMessages,
} from "../src/messages";

function msg(
  role: UIMessage["role"],
  parts: UIMessage["parts"],
  id?: string,
): UIMessage {
  return {
    id: id ?? `msg-${Math.random().toString(36).slice(2)}`,
    role,
    parts,
  };
}

describe("getToolName", () => {
  it("extracts name from toolName property", () => {
    expect(getToolName({ toolName: "weather" })).toBe("weather");
  });

  it("extracts name from tool- prefixed type", () => {
    expect(getToolName({ type: "tool-weather" })).toBe("weather");
  });

  it("returns undefined for non-tool parts", () => {
    expect(getToolName({ type: "text" })).toBeUndefined();
  });

  it("returns undefined for non-tool objects", () => {
    expect(getToolName({})).toBeUndefined();
    expect(getToolName({ type: "text" })).toBeUndefined();
  });
});

describe("mergeConsecutiveAssistantMessages", () => {
  it("merges two consecutive assistant messages into one", () => {
    const messages: UIMessage[] = [
      msg("user", [{ type: "text", text: "hi" }]),
      msg("assistant", [{ type: "text", text: "first" }]),
      msg("assistant", [{ type: "text", text: "second" }]),
    ];

    const result = mergeConsecutiveAssistantMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[1].parts).toHaveLength(2);
    expect((result[1].parts[0] as { text: string }).text).toBe("first");
    expect((result[1].parts[1] as { text: string }).text).toBe("second");
  });

  it("does not merge non-consecutive assistant messages", () => {
    const messages: UIMessage[] = [
      msg("assistant", [{ type: "text", text: "a1" }]),
      msg("user", [{ type: "text", text: "u1" }]),
      msg("assistant", [{ type: "text", text: "a2" }]),
    ];

    const result = mergeConsecutiveAssistantMessages(messages);
    expect(result).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(mergeConsecutiveAssistantMessages([])).toHaveLength(0);
  });
});

describe("enrichToolPartsWithSuspendData", () => {
  it("adds suspend field to tool part matching data-tool-suspend", () => {
    const messages: UIMessage[] = [
      msg("assistant", [
        {
          type: "tool-confirm",
          toolCallId: "tc-1",
          state: "input-available",
          input: { action: "delete" },
        } as any,
        {
          type: "data-tool-suspend",
          id: "tc-1",
          data: {
            toolCallId: "tc-1",
            toolName: "confirm",
            payload: { prompt: "Sure?" },
          },
        } as any,
      ]),
    ];

    const result = enrichToolPartsWithSuspendData(messages);
    expect(result).toHaveLength(1);
    // data-tool-suspend should be stripped
    expect(
      result[0].parts.find((p) => p.type === "data-tool-suspend"),
    ).toBeUndefined();
    // tool part should have suspend field
    const toolPart = result[0].parts.find(
      (p) => (p as any).toolCallId === "tc-1",
    ) as any;
    expect(toolPart.suspend).toBeDefined();
    expect(toolPart.suspend.toolCallId).toBe("tc-1");
    expect(toolPart.suspend.payload.prompt).toBe("Sure?");
  });

  it("strips resolved data-tool-suspend parts", () => {
    const messages: UIMessage[] = [
      msg("assistant", [
        {
          type: "tool-confirm",
          toolCallId: "tc-1",
          state: "output-available",
          output: "done",
        } as any,
        {
          type: "data-tool-suspend",
          id: "tc-1",
          data: { toolCallId: "tc-1", resolved: true },
        } as any,
      ]),
    ];

    const result = enrichToolPartsWithSuspendData(messages);
    expect(
      result[0].parts.find((p) => p.type === "data-tool-suspend"),
    ).toBeUndefined();
  });

  it("returns message unchanged when no data-tool-suspend parts exist", () => {
    const original: UIMessage[] = [
      msg("assistant", [{ type: "text", text: "hello" }]),
    ];
    const result = enrichToolPartsWithSuspendData(original);
    expect(result[0]).toBe(original[0]); // same reference
  });
});

describe("hasSuspendedTools", () => {
  it("returns true when a message has a part with suspend field", () => {
    const messages: UIMessage[] = [
      msg("assistant", [
        { type: "tool-confirm", toolCallId: "tc-1", suspend: {} } as any,
      ]),
    ];
    expect(hasSuspendedTools(messages)).toBe(true);
  });

  it("returns false when no parts have suspend field", () => {
    const messages: UIMessage[] = [
      msg("assistant", [{ type: "text", text: "hello" }]),
    ];
    expect(hasSuspendedTools(messages)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasSuspendedTools([])).toBe(false);
  });
});

describe("hasPendingFrontendTools", () => {
  const isFrontendTool = (name: string) => name === "my_frontend_tool";

  it("returns true when last assistant message has input-available frontend tool", () => {
    const messages: UIMessage[] = [
      msg("assistant", [
        {
          type: "tool-my_frontend_tool",
          toolCallId: "tc-1",
          state: "input-available",
          input: {},
        } as any,
      ]),
    ];
    expect(hasPendingFrontendTools(messages, isFrontendTool)).toBe(true);
  });

  it("returns false when tool is not a frontend tool", () => {
    const messages: UIMessage[] = [
      msg("assistant", [
        {
          type: "tool-backend_tool",
          toolCallId: "tc-1",
          state: "input-available",
          input: {},
        } as any,
      ]),
    ];
    expect(hasPendingFrontendTools(messages, isFrontendTool)).toBe(false);
  });

  it("returns false when last message is not assistant", () => {
    const messages: UIMessage[] = [
      msg("user", [{ type: "text", text: "hello" }]),
    ];
    expect(hasPendingFrontendTools(messages, isFrontendTool)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasPendingFrontendTools([], isFrontendTool)).toBe(false);
  });
});

describe("processMessages", () => {
  it("applies merge and enrich in sequence", () => {
    const messages: UIMessage[] = [
      msg("user", [{ type: "text", text: "hi" }]),
      msg("assistant", [
        {
          type: "tool-confirm",
          toolCallId: "tc-1",
          state: "input-available",
          input: {},
        } as any,
        {
          type: "data-tool-suspend",
          id: "tc-1",
          data: {
            toolCallId: "tc-1",
            toolName: "confirm",
            payload: { prompt: "Sure?" },
          },
        } as any,
      ]),
      msg("assistant", [{ type: "text", text: "follow-up" }]),
    ];

    const result = processMessages(messages);
    // Merge: 2 assistant messages → 1
    expect(result).toHaveLength(2);
    // Enrich: data-tool-suspend stripped, tool part has suspend
    expect(
      result[1].parts.find((p) => p.type === "data-tool-suspend"),
    ).toBeUndefined();
    const toolPart = result[1].parts.find(
      (p) => (p as any).toolCallId === "tc-1",
    ) as any;
    expect(toolPart.suspend).toBeDefined();
    // Follow-up text is also merged
    const textPart = result[1].parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
  });
});
