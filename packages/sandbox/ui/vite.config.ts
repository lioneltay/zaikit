import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Use relative paths so the UI works when mounted at any subpath (e.g. /sandbox)
  base: "./",
  build: {
    outDir: "../dist/ui",
    emptyOutDir: true,
  },
  server: {
    port: 4001,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
