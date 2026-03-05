import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/hono.ts",
    "src/adapters/express.ts",
    "src/devtools/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: false,
  sourcemap: true,
  external: ["express", "react", "@zaikit/react"],
});
