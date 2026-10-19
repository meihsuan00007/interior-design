import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSessionIdle, LAST_ACTIVITY_COOKIE } from "@/lib/auth/idle";

// middleware 在 Edge runtime 執行，不使用 getServerEnv()（zod 驗證含 Buffer），直接讀環境變數。
const idleMinutes = () => Number(process.env.SESSION_IDLE_MINUTES) || 120;

export async function middleware(request: NextRequest) {
  const isLoginPath = request.nextUrl.pathname.startsWith("/login");
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
    const [pathname, search] = path.split("?");
    url.pathname = pathname;
    url.search = search ? `?${search}` : "";
    if (signOut) await supabase.auth.signOut();
    const redirect = NextResponse.redirect(url);
    // 帶上 signOut 清除 session 的 cookie 變更
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.cookies.delete(LAST_ACTIVITY_COOKIE);
    return redirect;
  };

  if (!data.user) {
    if (isLoginPath) return response;
    return redirectTo("/login", false);
  }

  const raw = request.cookies.get(LAST_ACTIVITY_COOKIE)?.value;
  const last = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const now = Date.now();

  if (isSessionIdle(last, now, idleMinutes())) {
    return redirectTo("/login?reason=idle", true);
  }

  response.cookies.set(LAST_ACTIVITY_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
