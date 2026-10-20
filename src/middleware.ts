import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signActivity, verifyActivity } from "@/lib/auth/activity-cookie";
import { isSessionIdle, LAST_ACTIVITY_COOKIE, parseIdleMinutes } from "@/lib/auth/idle";

// middleware 在 Edge runtime 執行，不使用 getServerEnv()（zod 驗證含 Buffer），直接讀環境變數。

const MFA_PATH = "/login/mfa";

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();

  const redirectTo = async (path: string, signOut: boolean) => {
    const url = request.nextUrl.clone();
    const [target, search] = path.split("?");
    url.pathname = target;
    url.search = search ? `?${search}` : "";
    if (signOut) await supabase.auth.signOut({ scope: "local" });
    const redirect = NextResponse.redirect(url);
    // 帶上 signOut 清除 session 的 cookie 變更
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    if (signOut || !data.user) redirect.cookies.delete(LAST_ACTIVITY_COOKIE);
    return redirect;
  };

  if (!data.user) {
    if (isLoginPath(pathname)) return response;
    return redirectTo("/login", false);
  }

  // 已登入：last_activity 缺漏、格式錯誤、簽章不符或時間在未來，一律視為已閒置（傳入 0）
  const blindKey = process.env.BLIND_INDEX_KEY ?? "";
  const now = Date.now();
  const last = await verifyActivity(request.cookies.get(LAST_ACTIVITY_COOKIE)?.value, now, blindKey);
  if (isSessionIdle(last ?? 0, now, parseIdleMinutes(process.env.SESSION_IDLE_MINUTES))) {
    return redirectTo("/login?reason=idle", true);
  }

  // 已啟用 TOTP 但尚未通過第二步驟：除登入與驗證碼頁面外一律導向驗證碼頁
  if (!isLoginPath(pathname)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      return redirectTo(MFA_PATH, false);
    }
  }

  response.cookies.set(LAST_ACTIVITY_COOKIE, await signActivity(now, blindKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
