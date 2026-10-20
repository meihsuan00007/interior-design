import path from "node:path";
import { defineConfig } from "vitest/config";

// 整合測試：對本機 Supabase 執行（需先 npx supabase start）。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    globals: true,
    testTimeout: 20000,
    fileParallelism: false,
  },
});
