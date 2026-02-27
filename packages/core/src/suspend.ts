export const SUSPEND_MARKER = "__suspended" as const;

export type SuspendResult<T> = {
  readonly [K in typeof SUSPEND_MARKER]: true;
} & { readonly payload: T };

export function isSuspendResult(
  value: unknown,
): value is SuspendResult<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    SUSPEND_MARKER in value &&
    (value as Record<string, unknown>)[SUSPEND_MARKER] === true
  );
}

export function suspend<T>(payload: T): SuspendResult<T> {
  return { [SUSPEND_MARKER]: true, payload } as SuspendResult<T>;
}
