import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

// 資料庫連線（僅限伺服器端）。注意：DATABASE_URL 若為 postgres 角色會繞過 RLS，
// 以使用者身分查詢時必須另外切換角色並設定 request.jwt.claims。

function createDb() {
  const client = postgres(getServerEnv().DATABASE_URL, { prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { db?: Db };

/** 共用的 Drizzle 實例（開發模式熱重載時沿用同一連線池） */
export const db: Db = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
