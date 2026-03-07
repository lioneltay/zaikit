/**
 * Types for the writeData API — allows tools to emit custom data parts
 * to the stream mid-execution.
 *
 * Data parts appear as `data-{type}` chunks in the SSE stream and as
 * parts in the persisted UIMessage. The AI SDK deduplicates by id:
 * same type + id = update in place.
 */

export type WriteDataPart = {
  /** Data type name (auto-prefixed with `data-` on the wire) */
  type: string;
  /** Arbitrary payload */
  data: unknown;
  /** Unique ID. Auto-generated if not provided. Same id = update in place. */
  id?: string;
  /** If true, appears in the stream but is NOT persisted in the message */
  transient?: boolean;
};

export type WriteDataFn = (part: WriteDataPart) => void;

/** Typed function for writing tool-scoped data parts with schema validation. */
export type WriteToolDataFn<DATA extends Record<string, unknown>> = <
  K extends keyof DATA & string,
>(
  type: K,
  data: DATA[K],
  options?: { id?: string; transient?: boolean },
) => void;

/** Event emitted to the `onToolData` callback. */
export type ToolDataEvent = {
  toolName: string;
  toolCallId: string;
  type: string;
  data: unknown;
  id: string;
  transient?: boolean;
};

/**
 * Internal type used between `createTool` and `createWriteData`. The
 * `toolCallId` and `toolName` are set by `createTool` for tool-scoped parts
 * and are NOT part of the public `WriteDataPart` API.
 */
export type InternalWriteDataPart = WriteDataPart & {
  toolCallId?: string;
  toolName?: string;
};

/**
 * Internal WriteDataFn that accepts InternalWriteDataPart.
 * Used by createTool to pass toolCallId without casting.
 */
export type InternalWriteDataFn = (part: InternalWriteDataPart) => void;

// --- writeMetadata ---

/**
 * Function for tools to write message-level metadata.
 *
 * Metadata is deep-merged by the AI SDK into `message.metadata` on the client.
 * Unlike data parts, metadata has no `id`, `type`, or `transient` — it's just
 * a key-value object that accumulates via merging.
 */
export type WriteMetadataFn = (metadata: Record<string, unknown>) => void;

/**
 * Create an InternalWriteDataFn that auto-generates IDs, prefixes `data-` on
 * the wire, and optionally calls `onData` / `onToolData` callbacks.
 *
 * Used by both `coreAgentStream` and `handleResume` to avoid duplicating the
 * writeData-to-wire-format logic.
 *
 * Tool-scoped parts (those with a `toolCallId` set by `createTool`) wrap the
 * data in a `{ toolCallId, payload }` envelope on the wire so the frontend can
 * associate data parts with their tool call. The `onData` callback always
 * receives the original clean data.
 */
export function createWriteData(
  sink: (chunk: object) => void,
  onData?: (part: WriteDataPart) => void,
  onToolData?: (event: ToolDataEvent) => void,
): InternalWriteDataFn {
  return (part) => {
    const id = part.id ?? crypto.randomUUID();
    const type = part.type.startsWith("data-")
      ? part.type
      : `data-${part.type}`;
    const { toolCallId, toolName } = part;

    // Tool-scoped parts wrap data in an envelope so the frontend can match
    // data parts to their tool call via enrichToolPartsWithDataParts.
    // User data is never modified — it goes inside `payload` untouched.
    const wireData = toolCallId
      ? { toolCallId, payload: part.data }
      : part.data;

    sink({
      type,
      id,
      data: wireData,
      ...(part.transient && { transient: true }),
    });

    // onData callback receives clean data (without envelope)
    onData?.({
      type: part.type,
      data: part.data,
      id,
      ...(part.transient && { transient: true }),
    });

    // onToolData fires only for tool-scoped parts (writeToolData)
    if (toolCallId && toolName) {
      onToolData?.({
        toolName,
        toolCallId,
        type: part.type,
        data: part.data,
        id,
        ...(part.transient && { transient: true }),
      });
    }
  };
}

/**
 * Create a WriteMetadataFn that emits `message-metadata` chunks to the stream.
 *
 * The AI SDK deep-merges each chunk into `message.metadata` on the client,
 * so multiple calls accumulate rather than overwrite.
 */
export function createWriteMetadata(
  sink: (chunk: object) => void,
  onMetadata?: (metadata: Record<string, unknown>) => void,
): WriteMetadataFn {
  return (metadata) => {
    sink({ type: "message-metadata", messageMetadata: metadata });
    onMetadata?.(metadata);
  };
}
