import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { memoryConformanceTests } from "@zaikit/memory/test";
import postgres from "postgres";
import { afterAll, beforeAll } from "vitest";
import { createPostgresMemory } from "../src/index";

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

memoryConformanceTests({
  setup: async () => {
    const mem = createPostgresMemory({
      connectionString: container.getConnectionUri(),
    });
    await mem.initialize();
    // Clean tables between tests for isolation
    const sql = postgres(container.getConnectionUri());
    await sql`DELETE FROM zaikit_messages`;
    await sql`DELETE FROM zaikit_threads`;
    await sql.end();
    return mem;
  },
});
