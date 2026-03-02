import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/test/index.ts", "src/middleware/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      // Web Streams API (TransformStream, ReadableStream) used by middleware
      lib: ["ES2022", "DOM"],
    },
  },
  clean: true,
  sourcemap: true,
  external: ["vitest", "ai/test"],
});
