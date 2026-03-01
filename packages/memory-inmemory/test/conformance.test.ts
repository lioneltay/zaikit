import { memoryConformanceTests } from "@zaikit/memory/test";
import { createInMemoryMemory } from "../src/index";

memoryConformanceTests({
  setup: () => createInMemoryMemory(),
});
