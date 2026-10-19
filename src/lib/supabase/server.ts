import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 以使用者 JWT 呼叫 Supabase 的伺服器端 client（RLS 會生效）。 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch {
            // Server Component 內無法寫入 cookie；由 middleware 負責更新 session
          }
        },
      },
    },
  );
}
