import { createHmac } from "node:crypto";
import { and, eq, gte, or } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { isThrottled, THROTTLE_WINDOW_MS, type AttemptRecord } from "./login-throttle";

// 僅限伺服器端；以 Drizzle 連線存取 login_attempts（該表 RLS 無 policy）。

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  const key = Buffer.from(getServerEnv().BLIND_INDEX_KEY, "base64");
  return createHmac("sha256", key).update(`login-ip:${ip}`).digest("hex");
}

/** 查詢是否超過限制。資料庫失敗時放行（fail open），僅記錄固定訊息。 */
export async function checkThrottle(emailBidx: string, ipHash: string): Promise<boolean> {
  try {
    const now = Date.now();
    const rows = await db
      .select()
      .from(loginAttempts)
      .where(
        and(
          gte(loginAttempts.attemptedAt, new Date(now - THROTTLE_WINDOW_MS)),
          or(eq(loginAttempts.emailBidx, emailBidx), eq(loginAttempts.ipHash, ipHash)),
        ),
      );
    const attempts: AttemptRecord[] = rows.map((r) => ({
      emailBidx: r.emailBidx,
      ipHash: r.ipHash,
      succeeded: r.succeeded,
      attemptedAtMs: r.attemptedAt.getTime(),
    }));
    return isThrottled(attempts, { emailBidx, ipHash }, now);
  } catch {
    console.error("[auth] 讀取 login_attempts 失敗");
    return false;
  }
}

export async function recordAttempt(
  emailBidx: string,
  ipHash: string,
  succeeded: boolean,
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({ emailBidx, ipHash, succeeded });
  } catch {
    console.error("[auth] 寫入 login_attempts 失敗");
  }
}
