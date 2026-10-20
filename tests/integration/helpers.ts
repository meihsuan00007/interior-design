import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SEED_PASSWORD = "Passw0rd!23";

/** 每位使用者各用全新的 client（不共用 session）。 */
export async function signInAs(email: string): Promise<SupabaseClient> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  if (error) throw new Error(`登入 ${email} 失敗：${error.message}`);
  return client;
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
