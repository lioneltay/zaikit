import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from "@testcontainers/mongodb";
import { memoryConformanceTests } from "@zaikit/memory/test";
import { MongoClient } from "mongodb";
import { afterAll, beforeAll } from "vitest";
import { createMongoMemory } from "../src/index";

let container: StartedMongoDBContainer;

beforeAll(async () => {
  container = await new MongoDBContainer("mongo:7").start();
}, 60_000);

afterAll(async () => {
  await container?.stop();
});

memoryConformanceTests({
  setup: async () => {
    const url = `${container.getConnectionString()}?directConnection=true`;
    const mem = createMongoMemory({
      url,
      dbName: "zaikit_test",
    });
    await mem.initialize();
    // Clean collections between tests for isolation
    const client = new MongoClient(url);
    const db = client.db("zaikit_test");
    await db.collection("zaikit_messages").deleteMany({});
    await db.collection("zaikit_threads").deleteMany({});
    await db.collection("zaikit_counters").deleteMany({});
    await client.close();
    return mem;
  },
});
