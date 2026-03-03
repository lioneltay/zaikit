import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/adapters/hono.ts", "src/adapters/express.ts"],
  format: ["esm"],
  dts: true,
  clean: false,
  sourcemap: true,
  external: ["express"],
});
