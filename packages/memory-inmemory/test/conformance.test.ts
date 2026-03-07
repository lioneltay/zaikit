import { memoryConformanceTests } from "@zaikit/memory/test";
import { createInMemoryMemory } from "../src/index";

memoryConformanceTests({
  create: () => createInMemoryMemory(),
});
