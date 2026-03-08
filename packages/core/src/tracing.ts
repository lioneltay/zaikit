import type { Attributes, Context, Span } from "@opentelemetry/api";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("zaikit");

/**
 * Run an async function inside a new active span. The span becomes the parent
 * of any spans created within fn (including AI SDK spans via OTEL context
 * propagation).
 *
 * Sets span status to ERROR on throw, and always ends the span.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Run a synchronous function that returns a ReadableStream inside a new active
 * span. The span stays open while the stream is consumed and ends when the
 * stream closes, errors, or is cancelled.
 *
 * Uses a manual reader (not pipeThrough) to ensure the span ends on upstream
 * errors — TransformStream's flush/cancel don't fire when the source errors.
 */
export function withStreamSpan(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => ReadableStream<unknown>,
): ReadableStream<unknown> {
  return tracer.startActiveSpan(name, { attributes }, (span) => {
    try {
      const stream = fn(span);
      const reader = stream.getReader();
      return new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              span.end();
              controller.close();
            } else {
              controller.enqueue(value);
            }
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            span.end();
            controller.error(err);
          }
        },
        cancel() {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Stream cancelled",
          });
          span.end();
          reader.cancel();
        },
      });
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.end();
      throw err;
    }
  });
}

/**
 * Capture the current OTEL context. Use with `runInContext` to restore it
 * across async boundaries (e.g. inside ReadableStream.start callbacks).
 */
export function captureContext(): Context {
  return context.active();
}

/**
 * Run a function with a previously captured OTEL context active.
 * This ensures spans created inside fn are parented to the captured context.
 */
export function runInContext<T>(ctx: Context, fn: () => T): T {
  return context.with(ctx, fn);
}

export type { Span };
