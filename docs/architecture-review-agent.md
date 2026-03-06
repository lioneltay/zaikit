# Architecture Review: `packages/core/src/agent.ts`

**Date:** 2026-03-06
**File:** `packages/core/src/agent.ts` (1044 lines → 1038 after quick fixes)

## Summary

The agent file is the core of the framework — `createAgent()` is a single factory function that defines ~10 inner functions via closure. Recent additions (stream/generate APIs, structured output, dynamic system prompts, typed context in prepareStep) have grown the file significantly. While the code works and is well-tested (101 tests pass), there are clear opportunities to improve maintainability and type safety.

## Quick Fixes Applied

1. **`mergeTools()` shortcut** — Returns `resolvedTools` directly when no frontend tools are provided, avoiding a needless object spread on every request.
2. **`for await...of` consistency** — Replaced manual `reader.read()` loops in `streamToResponse()` and `generate()` with `for await...of`, matching the style already used in `coreAgentStream` (line 486).

## Findings

### High Priority

#### 1. `(opts as any).context` pattern (6 occurrences)

The conditional context types (`[C] extends [undefined] ? { context?: never } : { context: C }`) enforce type safety at the call site but are immediately bypassed inside the implementation with `(opts as any).context`. This defeats the purpose and adds noise.

**Locations:** Lines 389, 596, 602, 644, 963, 1025

**Suggested approach:** Create an internal helper or type that extracts context from the options without casting:
```ts
function getContext<C>(opts: { context?: C }): C | undefined {
  return (opts as any).context;
}
```
Or restructure internal functions to accept `context: unknown` and only enforce types at the public boundary.

#### 2. 15 `as any` casts (13 avoidable)

| Category | Count | Avoidable? |
|----------|-------|------------|
| `(opts as any).context` | 6 | Yes — see #1 |
| UIMessage part casts (`(p as any).data`, etc.) | 4 | Yes — type guards |
| `as StreamOptions<C>` | 4 | Yes — downstream of #1 |
| SDK tool execute signature | 1 | No |

#### 3. `handleResume` / `handleToolOutputs` duplication

Both functions end with identical tail sections:
1. Get messages from memory
2. Call `agentStream()`
3. Call `streamToResponse()`

They also share the "check remaining suspensions → return 204" pattern with the same `(p as any).data?.resolved` cast.

**Suggested approach:** Extract a `continueAfterToolResolution()` helper.

### Medium Priority

#### 4. `coreAgentStream` responsibility overload

This single function handles four concerns:
1. Stream production (ReadableStream creation, chunk enqueueing)
2. Multi-step orchestration (while loop, step chaining, maxSteps)
3. Structured output parsing (`parseCompleteOutput`)
4. Result aggregation (building AgentResult from steps)

Concerns 3 and 4 happen after the stream is consumed and are post-processing, not stream construction.

#### 5. `wrapToolsWithHooks()` rebuilt on every step

Called inside the `while(true)` loop at line 466. The hooks are fixed at agent creation time. Only `stepTools` changes (when `activeTools` filters the set).

**Suggested approach:** Pre-wrap the full tool set once. When `activeTools` is active, filter the pre-wrapped set instead of re-wrapping.

#### 6. `Output.Output` leaking into `coreAgentStream`

The public API uses `z.ZodType` but `coreAgentStream`'s callbacks accept `Output.Output`. The conversion happens in `agentStream()`. This means `coreAgentStream` is coupled to the AI SDK's `Output` interface.

#### 7. Repeated `(p as { toolCallId: string }).toolCallId` cast (6 occurrences)

UIMessage parts are a discriminated union. A type guard like `hasToolCallId(p)` would clean up 6 cast sites across `handleResume` and `handleToolOutputs`.

#### 8. Closure scope — 10 inner functions

`createAgent` is a 670-line function body. Some inner functions don't use the closure and could be standalone:
- `buildDynamicTools` — uses nothing from closure
- `streamToResponse` — everything passed as args
- `generateThreadTitle` — uses only `memory` and `model`

Extracting these would make the file scannable and individually testable.

### Low Priority

#### 9. `sumUsage()` duplicates AI SDK internals

The AI SDK has an identical internal `addLanguageModelUsage()` function, but it is not publicly exported. Our copy is necessary since our agent loop runs multiple `streamText` calls. If the SDK ever exports this, we should use it.

#### 10. `Promise.withResolvers` not available

The deferred promise pattern (lines 608-614) is a textbook `Promise.withResolvers()` case, but the project targets ES2022. Worth adopting when the target is bumped.

#### 11. `resultPromise.catch(() => {})` error suppression

Errors are still propagated to stream consumers via `controller.error(err)`, and `generate()` awaits the promise. The suppression only prevents unhandled rejection warnings in `chat()` where the result promise isn't awaited. This is correct behavior, but worth a note if someone changes the error flow.

## Modularization Proposal

The file has clear seams. A possible split:

| New File | Contents | Lines |
|----------|----------|-------|
| `agent-types.ts` | All exported types, hook context types, tool config types, options/result types, `Agent` type | ~200 |
| `agent-helpers.ts` | `sumUsage`, `addTokenCounts`, `wrapToolsWithHooks`, `resolveToolEntries`, `buildDynamicTools` | ~155 |
| `agent-chat.ts` | `handleResume`, `handleToolOutputs`, `streamToResponse`, `generateThreadTitle` | ~290 |
| `agent.ts` | `createAgent`, `coreAgentStream`, `agentStream`, public API object | ~400 |

This would bring `agent.ts` down to ~400 lines — the core logic only. The type file is pure declarations. The helpers are standalone functions. The chat handlers are the memory-dependent persistence layer.

**Trade-off:** More files to navigate vs. each file having a single responsibility. The closure coupling (handlers need `memory`, `agentStream`, `mergeTools`) means some functions would need those passed as arguments rather than captured via closure — arguably a better design since it makes dependencies explicit.

## Recommended Next Steps

1. **Extract types** — Zero-risk, pure refactor. Makes `agent.ts` immediately ~200 lines shorter.
2. **Extract standalone helpers** — `sumUsage`, `addTokenCounts`, `wrapToolsWithHooks`, `resolveToolEntries` don't need closure access. Move them out.
3. **Add UIMessage part type guard** — `hasToolCallId(p)` eliminates 6 casts.
4. **Fix context casting** — Internal helper or rethink internal types to avoid the `as any` chain.
5. **Pre-wrap tools with hooks** — Move `wrapToolsWithHooks` call out of the per-step loop.
6. **Extract chat handlers** — `handleResume`/`handleToolOutputs` are self-contained with explicit dependencies. Extract and deduplicate the shared tail.
