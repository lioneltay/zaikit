import { SpanStatusCode } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSpan, withStreamSpan } from "../src/tracing";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

beforeAll(() => {
  provider.register();
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
});

/** Drain a ReadableStream to an array. */
async function drain<T>(stream: ReadableStream<T>): Promise<T[]> {
  const items: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    items.push(value);
  }
  return items;
}

describe("withSpan", () => {
  it("creates a span and returns the result", async () => {
    const result = await withSpan("test-span", { key: "val" }, async () => 42);

    expect(result).toBe(42);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("test-span");
    expect(spans[0].attributes.key).toBe("val");
  });

  it("sets ERROR status and rethrows on exception", async () => {
    const err = new Error("boom");
    await expect(
      withSpan("fail-span", {}, async () => {
        throw err;
      }),
    ).rejects.toThrow("boom");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("boom");
  });

  it("ends the span even on error", async () => {
    await withSpan("ok-span", {}, async () => "ok");
    await expect(
      withSpan("err-span", {}, async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();

    const spans = exporter.getFinishedSpans();
    // Both spans should be finished (ended)
    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(span.endTime).toBeDefined();
      expect(span.endTime[0]).toBeGreaterThan(0);
    }
  });
});

describe("withStreamSpan", () => {
  it("creates a span that ends when the stream closes", async () => {
    const stream = withStreamSpan(
      "stream-span",
      { x: 1 },
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue("a");
            controller.enqueue("b");
            controller.close();
          },
        }),
    );

    const items = await drain(stream);
    expect(items).toEqual(["a", "b"]);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("stream-span");
    expect(spans[0].attributes.x).toBe(1);
    // No error status on normal close
    expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
  });

  it("sets ERROR status when the source stream errors", async () => {
    let controllerRef!: ReadableStreamDefaultController;
    const stream = withStreamSpan(
      "error-span",
      {},
      () =>
        new ReadableStream({
          start(controller) {
            controllerRef = controller;
            controller.enqueue("ok");
          },
        }),
    );

    const reader = stream.getReader();
    // First chunk succeeds
    const { value } = await reader.read();
    expect(value).toBe("ok");

    // Error the source after the first read
    controllerRef.error(new Error("upstream fail"));

    // Next read gets the error
    await expect(reader.read()).rejects.toThrow("upstream fail");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("upstream fail");
  });

  it("sets ERROR status and ends span when stream is cancelled", async () => {
    const stream = withStreamSpan(
      "cancel-span",
      {},
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue("first");
          },
        }),
    );

    const reader = stream.getReader();
    await reader.read(); // consume "first"
    await reader.cancel(); // cancel the stream

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("Stream cancelled");
  });

  it("sets ERROR status when fn() throws synchronously", () => {
    expect(() =>
      withStreamSpan("sync-throw-span", {}, () => {
        throw new Error("sync boom");
      }),
    ).toThrow("sync boom");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe("sync boom");
  });

  it("ends span exactly once on normal close", async () => {
    const stream = withStreamSpan(
      "once-span",
      {},
      () =>
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
    );

    await drain(stream);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
  });
});
