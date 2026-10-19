"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { writeLoginFailedAudit } from "@/lib/audit-failed-login";
import { LAST_ACTIVITY_COOKIE } from "@/lib/auth/idle";
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
  (await cookies()).set(LAST_ACTIVITY_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    try {
      await writeLoginFailedAudit(parsed.data.email);
    } catch (e) {
      console.error("[audit] 寫入 auth.login_failed 失敗", e instanceof Error ? e.message : "unknown");
    }
    return { error: GENERIC_LOGIN_ERROR };
  }

  await touchActivity();

  // 已啟用 TOTP 者需再輸入 6 位數驗證碼，通過後才寫 auth.login
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/mfa");

  await writeAudit({ action: "auth.login", targetType: "user", targetId: null });
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
  if (error) return { error: "驗證碼錯誤，請重新輸入" };

  await touchActivity();
  await writeAudit({ action: "auth.login", targetType: "user", targetId: null });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  try {
    await writeAudit({ action: "auth.logout", targetType: "user", targetId: null });
  } catch (e) {
    console.error("[audit] 寫入 auth.logout 失敗", e instanceof Error ? e.message : "unknown");
  }
  await supabase.auth.signOut();
  (await cookies()).delete(LAST_ACTIVITY_COOKIE);
  redirect("/login");
}
