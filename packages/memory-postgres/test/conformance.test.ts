import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { memoryConformanceTests } from "@zaikit/memory/test";
import { createPostgresMemory } from "../src/index";

memoryConformanceTests<StartedPostgreSqlContainer>({
  start: () => new PostgreSqlContainer("postgres:17-alpine").start(),
  stop: (container) => container.stop(),
  create: (container) =>
    createPostgresMemory({ connectionString: container.getConnectionUri() }),
});
