"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { writeAudit, type AuditEvent } from "@/lib/audit";
import { writeLoginFailedAudit, writeMfaFailedAudit } from "@/lib/audit-failed-login";
import { signActivity } from "@/lib/auth/activity-cookie";
import { LAST_ACTIVITY_COOKIE } from "@/lib/auth/idle";
import { THROTTLE_MESSAGE } from "@/lib/auth/login-throttle";
import { checkThrottle, clientIpHash, recordAttempt } from "@/lib/auth/login-throttle-db";
import { blindIndex } from "@/lib/crypto/blind-index";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
}

const GENERIC_LOGIN_ERROR = "帳號或密碼錯誤";

const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

async function touchActivity() {
  const value = await signActivity(Date.now(), getServerEnv().BLIND_INDEX_KEY);
  (await cookies()).set(LAST_ACTIVITY_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

/** 登入成功後的稽核：失敗只記固定訊息，不得讓使用者看到錯誤頁 */
async function auditQuietly(e: AuditEvent) {
  try {
    await writeAudit(e);
  } catch {
    console.error(`[audit] 寫入 ${e.action} 失敗`);
  }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR };

  const emailBidx = blindIndex("email", parsed.data.email);
  const ipHash = await clientIpHash();
  if (await checkThrottle(emailBidx, ipHash)) {
    await recordAttempt(emailBidx, ipHash, false);
    return { error: THROTTLE_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  await recordAttempt(emailBidx, ipHash, !error);
  if (error) {
    // 稽核寫入不阻塞回應
    after(() => writeLoginFailedAudit(parsed.data.email));
    return { error: GENERIC_LOGIN_ERROR };
  }

  await touchActivity();

  // 已啟用 TOTP 者需再輸入 6 位數驗證碼，通過後才寫 auth.login
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/mfa");

  await auditQuietly({ action: "auth.login", targetType: "user", targetId: null });
  redirect("/");
}

const mfaSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function verifyMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = mfaSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: "請輸入 6 位數驗證碼" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/");

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });
  if (error) {
    const userId = auth.user.id;
    after(() => writeMfaFailedAudit(userId));
    return { error: "驗證碼錯誤，請重新輸入" };
  }

  await touchActivity();
  await auditQuietly({ action: "auth.login", targetType: "user", targetId: null });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await auditQuietly({ action: "auth.logout", targetType: "user", targetId: null });
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(LAST_ACTIVITY_COOKIE);
  redirect("/login");
}
