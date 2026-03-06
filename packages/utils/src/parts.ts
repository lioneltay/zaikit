/**
 * Shared constants and type predicates for UIMessage parts.
 *
 * Used across @zaikit/core, @zaikit/utils, and @zaikit/react to avoid
 * duplicating magic strings and type guards.
 */

// --- Constants ---

/** The custom data part type used for tool suspension. */
export const DATA_TOOL_SUSPEND = "data-tool-suspend" as const;

// --- Predicates ---

/** Check if a part is a tool part (static `tool-{name}` or dynamic `dynamic-tool`). */
export function isToolPart(
  p: object,
): p is { toolCallId: string; type: string } {
  const part = p as { type?: string };
  return (
    "toolCallId" in p &&
    typeof part.type === "string" &&
    (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
  );
}

/** The data shape of a `data-tool-suspend` part. */
export type SuspendPartData = {
  toolCallId: string;
  toolName: string;
  payload: unknown;
  resolved?: boolean;
};

/** Check if a part is a `data-tool-suspend` part. */
export function isSuspendPart(
  p: object,
): p is { type: typeof DATA_TOOL_SUSPEND; id: string; data: SuspendPartData } {
  return "data" in p && (p as { type?: string }).type === DATA_TOOL_SUSPEND;
}

/** Check if a part has a toolCallId property. */
export function hasToolCallId(
  p: object,
): p is { toolCallId: string; type: string } {
  return "toolCallId" in p;
}

/** Check if a part is a custom data part (starts with `data-`) but NOT `data-tool-suspend`. */
export function isCustomDataPart(
  p: object,
): p is { type: string; id: string; data: unknown } {
  const part = p as { type?: string };
  return (
    "id" in p &&
    "data" in p &&
    typeof part.type === "string" &&
    part.type.startsWith("data-") &&
    part.type !== DATA_TOOL_SUSPEND
  );
}

// --- Wire envelope type ---

/**
 * The wire format for tool-scoped data parts. Created by `createWriteData`
 * in @zaikit/core, consumed by `enrichToolPartsWithDataParts` in @zaikit/utils.
 *
 * User data goes inside `payload` untouched.
 */
export type ToolDataEnvelope = {
  toolCallId: string;
  payload: unknown;
};

/** Check if data is a tool-scoped envelope (has toolCallId and payload). */
export function isToolDataEnvelope(data: unknown): data is ToolDataEnvelope {
  return (
    data != null &&
    typeof data === "object" &&
    "toolCallId" in data &&
    "payload" in data
  );
}
