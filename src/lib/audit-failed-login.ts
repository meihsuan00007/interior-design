import { eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { db } from "@/db/client";
import { auditLogs, memberships } from "@/db/schema";
import { blindIndex } from "@/lib/crypto/blind-index";

// 沒有可用 session（或 session 尚未通過 MFA，被 RLS 擋住）時的稽核寫入，以伺服器端 Drizzle 連線執行，僅限伺服器使用。
// 任何錯誤都只記錄固定訊息與盲索引：DrizzleQueryError 的 message 會帶出查詢參數（含明文 email），不可記錄。

/**
 * 登入失敗：actor_id 為 null；metadata 只放 email 的盲索引。
 * 查無此帳號時不寫資料庫（無從判斷公司），只在伺服器日誌留盲索引。
 */
export async function writeLoginFailedAudit(email: string): Promise<void> {
  const emailBidx = blindIndex("email", email);
  try {
    const orgs = await db
      .select({ organizationId: memberships.organizationId })
      .from(authUsers)
      .innerJoin(memberships, eq(memberships.userId, authUsers.id))
      .where(eq(authUsers.email, email.trim().toLowerCase()));

    if (orgs.length === 0) {
      console.warn(`[audit] auth.login_failed 查無對應帳號 email_bidx=${emailBidx}`);
      return;
    }

    await db.insert(auditLogs).values(
      orgs.map((o) => ({
        organizationId: o.organizationId,
        actorId: null,
        action: "auth.login_failed",
        targetType: "user",
        targetId: null,
        metadata: { email_bidx: emailBidx },
      })),
    );
  } catch {
    console.error(`[audit] 寫入 auth.login_failed 失敗 email_bidx=${emailBidx}`);
  }
}

/** 第二步驟（TOTP）驗證碼錯誤：使用者已通過密碼（aal1），actor_id 為該使用者。 */
export async function writeMfaFailedAudit(userId: string): Promise<void> {
  try {
    const orgs = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, userId));
    if (orgs.length === 0) return;
    await db.insert(auditLogs).values(
      orgs.map((o) => ({
        organizationId: o.organizationId,
        actorId: userId,
        action: "auth.login_failed",
        targetType: "user",
        targetId: userId,
        metadata: { stage: "mfa" },
      })),
    );
  } catch {
    console.error("[audit] 寫入 auth.login_failed (mfa) 失敗");
  }
}
