import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, proxy: { "/api": "http://127.0.0.1:5174" } },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Libraries change far less often than app code, so cache them separately.
        manualChunks: (id) =>
          id.includes("node_modules") ? "vendor" : undefined,
      },
    },
  },
  test: {
    include: [
      "src/**/*.test.tsx",
      "src/lib/**/*.test.ts",
      "src/format.test.ts",
    ],
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
