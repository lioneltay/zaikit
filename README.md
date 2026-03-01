# <img src="logo.svg" width="28" height="28" alt="" /> ZAIKit

A toolkit for building AI-powered applications with TypeScript.

## Packages

| Package | Description |
| --- | --- |
| [`@zaikit/core`](packages/core) | Agent creation, tool definitions, model configuration |
| [`@zaikit/react`](packages/react) | React hooks and components (`useAgent`, `useAgentChat`, `AgentProvider`) |
| [`@zaikit/memory-postgres`](packages/memory-postgres) | Postgres-backed memory for agents |
| [`@zaikit/codegen-react`](packages/codegen-react) | Code generation for React tool renderers |

## Quick Start

```bash
pnpm add @zaikit/core @zaikit/react
```

```tsx
import { createAgent, createTool, model } from "@zaikit/core";
import { AgentProvider, useAgentChat } from "@zaikit/react";

const agent = createAgent({
  model: model("google-vertex:gemini-2.0-flash"),
  tools: [
    createTool({
      name: "greet",
      description: "Greet the user",
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    }),
  ],
});
```

## Documentation

[https://zaikit.dev](https://zaikit.dev)

## License

MIT
