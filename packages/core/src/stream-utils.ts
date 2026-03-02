/**
 * Transform chunks one-by-one in a readable stream.
 * Return null from the transform function to drop a chunk.
 */
export function mapChunks<T>(
  stream: ReadableStream<T>,
  fn: (chunk: T) => T | null,
): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        const result = fn(chunk);
        if (result !== null) {
          controller.enqueue(result);
        }
      },
    }),
  );
}

/** Collected stream result — all chunks buffered. */
export type CollectedStream<T = unknown> = {
  chunks: T[];
};

/** Buffer an entire readable stream into a collected result. */
export async function collectStream<T>(
  stream: ReadableStream<T>,
): Promise<CollectedStream<T>> {
  const chunks: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return { chunks };
}

/** Convert a collected result back to a readable stream. */
export function toStream<T>(collected: CollectedStream<T>): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const chunk of collected.chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}
