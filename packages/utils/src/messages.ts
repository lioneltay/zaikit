import type { UIMessage } from "ai";
import {
  hasToolCallId,
  isCustomDataPart,
  isSuspendPart,
  isToolDataEnvelope,
} from "./parts";

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
      if (isSuspendPart(p) && !p.data.resolved) {
        suspendMap.set(p.data.toolCallId, p.data);
      }
    }
    if (suspendMap.size === 0) {
      // Still strip resolved data-tool-suspend parts
      const hasSuspendParts = m.parts.some((p) => isSuspendPart(p));
      if (!hasSuspendParts) return m;
      return {
        ...m,
        parts: m.parts.filter((p) => !isSuspendPart(p)),
      };
    }

    const parts = m.parts
      .filter((p) => !isSuspendPart(p))
      .map((p) => {
        if (hasToolCallId(p)) {
          const suspendData = suspendMap.get(p.toolCallId);
          if (suspendData) {
            return { ...p, suspend: suspendData };
          }
        }
        return p;
      });

    return { ...m, parts };
  });
}

export type ToolDataPart = {
  type: string;
  id: string;
  data: unknown;
};

/**
 * Collect tool-scoped data parts (those with `data.toolCallId`) and attach
 * them to their corresponding tool part as `data`. Strip the collected
 * data parts from the message parts array. `toolCallId` is removed from each
 * data part's data before attaching.
 */
export function enrichToolPartsWithDataParts(
  messages: UIMessage[],
): UIMessage[] {
  return messages.map((m) => {
    // Build a map: toolCallId → array of data parts
    const dataMap = new Map<string, ToolDataPart[]>();
    for (const p of m.parts) {
      if (isCustomDataPart(p) && isToolDataEnvelope(p.data)) {
        const { toolCallId, payload } = p.data;
        const list = dataMap.get(toolCallId) ?? [];
        list.push({
          type: p.type.slice(5), // strip "data-" prefix
          id: p.id,
          data: payload,
        });
        dataMap.set(toolCallId, list);
      }
    }
    if (dataMap.size === 0) return m;

    const toolCallIds = new Set(dataMap.keys());
    const parts = m.parts
      .filter((p) => {
        if (!isCustomDataPart(p)) return true;
        return (
          !isToolDataEnvelope(p.data) || !toolCallIds.has(p.data.toolCallId)
        );
      })
      .map((p) => {
        if (hasToolCallId(p)) {
          const data = dataMap.get(p.toolCallId);
          if (data) {
            return { ...p, data };
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
 * 3. Collect tool-scoped data parts onto their tool parts
 */
export function processMessages(messages: UIMessage[]): UIMessage[] {
  return enrichToolPartsWithDataParts(
    enrichToolPartsWithSuspendData(mergeConsecutiveAssistantMessages(messages)),
  );
}
