import { defineConfig } from "drizzle-kit";

// 只產生遷移檔（drizzle-kit generate），由 Supabase CLI 套用；不使用 drizzle-kit push / migrate。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
