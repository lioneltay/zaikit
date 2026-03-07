import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from "@testcontainers/mongodb";
import { memoryConformanceTests } from "@zaikit/memory/test";
import { createMongoMemory } from "../src/index";

memoryConformanceTests<StartedMongoDBContainer>({
  start: () => new MongoDBContainer("mongo:7").start(),
  stop: (container) => container.stop(),
  create: (container) =>
    createMongoMemory({
      url: `${container.getConnectionString()}?directConnection=true`,
    }),
});
