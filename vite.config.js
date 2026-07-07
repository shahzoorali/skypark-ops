import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 8734 },
  build: { chunkSizeWarningLimit: 1200 },
});
