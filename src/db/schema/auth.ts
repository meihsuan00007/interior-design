import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "./columns";

/**
 * 登入嘗試紀錄（應用層速率限制用）。
 * 只存 IP 與 email 的盲索引（HMAC），不存明文。RLS 啟用且無任何 policy，
 * 僅限伺服器端（service role／Drizzle 連線）存取。
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    ipHash: text("ip_hash").notNull(),
    emailBidx: text("email_bidx").notNull(),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_bidx_attempted_at_idx").on(t.emailBidx, t.attemptedAt),
    index("login_attempts_ip_hash_attempted_at_idx").on(t.ipHash, t.attemptedAt),
  ],
);
