# @zaikit/core

Core library for building AI agents — agent creation, tool definitions, and model configuration.

## Install

```bash
pnpm add @zaikit/core
```

## Usage

```ts
import { createAgent, createTool, model } from "@zaikit/core";

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
