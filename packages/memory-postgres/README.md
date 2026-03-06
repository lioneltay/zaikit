# @zaikit/memory-postgres

Postgres-backed memory provider for ZAIKit agents. Persists conversation threads and messages.

## Install

```bash
pnpm add @zaikit/memory-postgres
```

## Usage

```ts
import { createAgent } from "@zaikit/core";
import { createPostgresMemory } from "@zaikit/memory-postgres";

const memory = createPostgresMemory({
  connectionString: process.env.DATABASE_URL,
});

const agent = createAgent({
  memory,
  // ...
});
```

## Documentation

[https://zaikit.dev](https://zaikit.dev)

## License

Apache-2.0
