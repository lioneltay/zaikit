# <img src="logo.svg" width="28" height="28" alt="" /> ZAIKit

A TypeScript toolkit for building full-stack AI agents with streaming, tool rendering, and human-in-the-loop.

> **[Read the docs at zaikit.dev](https://zaikit.dev)**

## Features

- **Full-stack agents** — Define your agent and tools on the server, connect from React with a single provider.
- **Streaming** — Responses stream from backend to browser over SSE with zero configuration.
- **Tool rendering** — Map tool calls to React components with full type inference via codegen.
- **Suspend and resume** — Tools can pause for human input and resume with the user's response.
- **Middleware** — Intercept and transform requests/responses with composable middleware (guard rails, RAG injection, HTML stripping).
- **Persistence** — Plug in a memory backend to save and restore conversations across sessions.

## Packages

| Package | Description |
| --- | --- |
| [`@zaikit/core`](https://zaikit.dev/concepts/agent-loop) | Agent and tool primitives — `createAgent`, `createTool` |
| [`@zaikit/react`](https://zaikit.dev/reference/react) | React bindings — `AgentProvider`, `useAgent`, `useToolRenderer` |
| [`@zaikit/memory`](https://zaikit.dev/reference/memory) | Memory interface types — `Memory`, `Thread` |
| [`@zaikit/memory-postgres`](https://zaikit.dev/reference/memory-postgres) | PostgreSQL-backed conversation persistence |
| [`@zaikit/memory-inmemory`](https://zaikit.dev/reference/memory-inmemory) | In-memory persistence for development and testing |
| [`@zaikit/codegen-react`](https://zaikit.dev/reference/codegen-react) | CLI to generate typed tool render props from your agent definition |

## Quick Start

```bash
pnpm add @zaikit/core @zaikit/react
```

**Backend** — define an agent with tools:

```ts
import { createAgent, createTool } from "@zaikit/core";
import { z } from "zod";

const agent = createAgent({
  model: yourModel, // any AI SDK LanguageModel
  tools: {
    get_weather: createTool({
      description: "Get weather for a city",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ input }) => ({
        city: input.city,
        temp: 22,
        condition: "Sunny",
      }),
    }),
  },
});
```

**Frontend** — connect and render:

```tsx
import { AgentProvider, useAgent } from "@zaikit/react";

function Chat() {
  const { messages, sendMessage } = useAgent();
  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) =>
            part.type === "text" ? <p key={i}>{part.text}</p> : null,
          )}
        </div>
      ))}
      <button onClick={() => sendMessage?.({ text: "What's the weather?" })}>
        Send
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AgentProvider api="/api/chat" threadId="thread-1">
      <Chat />
    </AgentProvider>
  );
}
```

See the [Getting Started guide](https://zaikit.dev/getting-started) for a full walkthrough.

## License

MIT
