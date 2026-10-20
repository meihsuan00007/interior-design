import { sql } from "drizzle-orm";
import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

// 共用欄位與型別。金額一律 numeric（Drizzle 以字串回傳，交給 decimal.js 運算，禁止浮點數）。

/** 主鍵：uuid default gen_random_uuid() */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** 金額：numeric(14,0)，以元為單位 */
export const money = (name: string) => numeric(name, { precision: 14, scale: 0 });

/** 單價、數量：numeric(14,2) */
export const decimal14x2 = (name: string) => numeric(name, { precision: 14, scale: 2 });

/** 比例（0～1，例：管理費 0.100000、分攤比例）：numeric(7,6) */
export const ratio = (name: string) => numeric(name, { precision: 7, scale: 6 });

/** created_at、updated_at、created_by（預設為目前登入者 auth.uid()） */
export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").default(sql`auth.uid()`),
});

export const TAX_MODES = ["exclusive", "inclusive"] as const;
export const MEMBER_ROLES = ["admin", "designer", "supervisor"] as const;
