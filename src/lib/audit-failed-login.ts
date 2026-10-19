import { eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { db } from "@/db/client";
import { auditLogs, memberships } from "@/db/schema";
import { blindIndex } from "@/lib/crypto/blind-index";

/**
 * 登入失敗的稽核（沒有 session，故以伺服器端 Drizzle 連線寫入，僅限伺服器使用）。
 * - actor_id 為 null；metadata 只放 email 的盲索引，不放明文。
 * - 查無此帳號時不寫資料庫（無從判斷公司），只在伺服器日誌留盲索引。
 */
export async function writeLoginFailedAudit(email: string): Promise<void> {
  const emailBidx = blindIndex("email", email);
  const normalized = email.trim().toLowerCase();

  const orgs = await db
    .select({ organizationId: memberships.organizationId })
    .from(authUsers)
    .innerJoin(memberships, eq(memberships.userId, authUsers.id))
    .where(eq(authUsers.email, normalized));

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
}
