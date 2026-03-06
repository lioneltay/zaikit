import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";

/**
 * Extends `DefaultChatTransport` to support resume-via-POST.
 *
 * The AI SDK's `reconnectToStream` always makes a GET request (designed for
 * reconnecting to interrupted SSE streams). We override it so that when the
 * request body contains `resume` data, we make a POST instead — this lets
 * `chat.resumeStream()` route resume requests through `useChat`'s native
 * stream processing pipeline.
 */
export class AgentChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends DefaultChatTransport<UI_MESSAGE> {
  async reconnectToStream(options: {
    chatId: string;
    headers?: Record<string, string> | Headers;
    body?: object;
    metadata?: unknown;
  }): Promise<ReadableStream<UIMessageChunk> | null> {
    const body = options.body as Record<string, unknown> | undefined;

    if (!body?.resume) {
      return super.reconnectToStream(options);
    }

    const fetchFn = this.fetch ?? globalThis.fetch;
    const response = await fetchFn(this.api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...normalizeHeaders(options.headers),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error((await response.text()) || "Resume request failed.");
    }

    if (!response.body) {
      throw new Error("The response body is empty.");
    }

    return this.processResponseStream(response.body);
  }
}

function normalizeHeaders(
  headers: Record<string, string> | Headers | undefined,
): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return headers;
}
