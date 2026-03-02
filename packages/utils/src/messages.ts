import type { UIMessage } from "ai";

/** Extract tool name from a UIMessage part (handles both toolName prop and type prefix). */
export function getToolName(p: unknown): string | undefined {
  const part = p as Record<string, unknown>;
  if (typeof part.toolName === "string") return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-"))
    return part.type.slice(5);
  return undefined;
}

/** Merge consecutive assistant messages into a single message with combined parts. */
export function mergeConsecutiveAssistantMessages(
  messages: UIMessage[],
): UIMessage[] {
  const merged: UIMessage[] = [];
  for (const msg of messages) {
    const prev = merged[merged.length - 1];
    if (prev?.role === "assistant" && msg.role === "assistant") {
      merged[merged.length - 1] = {
        ...prev,
        parts: [...prev.parts, ...msg.parts],
      };
    } else {
      merged.push(msg);
    }
  }
  return merged;
}

/**
 * Enrich tool parts with suspend data from data-tool-suspend parts,
 * then strip data-tool-suspend parts from the output.
 */
export function enrichToolPartsWithSuspendData(
  messages: UIMessage[],
): UIMessage[] {
  return messages.map((m) => {
    const suspendMap = new Map<string, unknown>();
    for (const p of m.parts) {
      if (p.type === "data-tool-suspend" && !(p as any).data?.resolved) {
        const data = (p as any).data;
        suspendMap.set(data.toolCallId, data);
      }
    }
    if (suspendMap.size === 0) {
      // Still strip resolved data-tool-suspend parts
      const hasDataToolSuspend = m.parts.some(
        (p) => p.type === "data-tool-suspend",
      );
      if (!hasDataToolSuspend) return m;
      return {
        ...m,
        parts: m.parts.filter((p) => p.type !== "data-tool-suspend"),
      };
    }

    const parts = m.parts
      .filter((p) => p.type !== "data-tool-suspend")
      .map((p) => {
        if ("toolCallId" in p) {
          const suspendData = suspendMap.get(
            (p as { toolCallId: string }).toolCallId,
          );
          if (suspendData) {
            return { ...p, suspend: suspendData };
          }
        }
        return p;
      });

    return { ...m, parts };
  });
}

/** Check if any message has suspended tool parts. */
export function hasSuspendedTools(messages: UIMessage[]): boolean {
  return messages.some((m) => m.parts.some((p) => "suspend" in p));
}

/** Check if the last assistant message has pending frontend tools (input-available state). */
export function hasPendingFrontendTools(
  messages: UIMessage[],
  isFrontendTool: (name: string) => boolean,
): boolean {
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role !== "assistant") return false;
  return lastMsg.parts.some((p) => {
    const name = getToolName(p);
    return (
      "toolCallId" in p &&
      name != null &&
      isFrontendTool(name) &&
      (p as any).state === "input-available"
    );
  });
}

/**
 * Apply all message transforms in sequence:
 * 1. Merge consecutive assistant messages
 * 2. Enrich tool parts with suspend data and strip data-tool-suspend parts
 */
export function processMessages(messages: UIMessage[]): UIMessage[] {
  return enrichToolPartsWithSuspendData(
    mergeConsecutiveAssistantMessages(messages),
  );
}
