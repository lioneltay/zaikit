import type { TelemetrySettings } from "ai";

/**
 * Merge agent-level telemetry with per-request overrides, then auto-enrich
 * metadata with sessionId, userId, and tags for observability platforms.
 * User-provided metadata takes precedence over auto-injected values.
 */
export function buildTelemetry(opts: {
  defaults?: TelemetrySettings;
  overrides?: boolean | Partial<TelemetrySettings>;
  agentName?: string;
  threadId?: string;
  userId?: string;
}): TelemetrySettings | undefined {
  // Resolve boolean shorthand: `true` = enable, `false` = force-disable.
  const overrides =
    opts.overrides === true
      ? { isEnabled: true }
      : opts.overrides === false
        ? { isEnabled: false }
        : opts.overrides;

  if (!opts.defaults && !overrides) return undefined;

  // Merge defaults with overrides
  const base = opts.defaults ?? { isEnabled: false };
  const merged = overrides
    ? {
        ...base,
        ...overrides,
        metadata: { ...base.metadata, ...overrides.metadata },
      }
    : base;

  // Auto-enrich metadata — user-provided values take precedence
  const metadata: Record<string, unknown> = {
    ...(merged.metadata as Record<string, unknown>),
  };
  if (opts.threadId && !metadata.sessionId) metadata.sessionId = opts.threadId;
  if (opts.userId && !metadata.userId) metadata.userId = opts.userId;
  if (opts.agentName) {
    const existing = Array.isArray(metadata.tags)
      ? (metadata.tags as string[])
      : [];
    metadata.tags = [opts.agentName, ...existing];
  }

  return { ...merged, metadata: metadata as TelemetrySettings["metadata"] };
}
