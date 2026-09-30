import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "worker/**/*.test.ts",
      "packages/**/*.test.ts",
      "apps/client/src/demo/**/*.test.ts",
    ],
    restoreMocks: true,
  },
});
