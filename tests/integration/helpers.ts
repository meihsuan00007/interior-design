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

/** 與 writeAudit 相同的寫入規則，但使用測試 client 而非 cookie client。 */
export function auditVia(supabase: SupabaseClient) {
  return async (e: {
    action: string;
    targetType: string;
    targetId: string | null;
    organizationId?: string;
    metadata?: Record<string, string | number | boolean>;
  }) => {
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: e.organizationId,
      actor_id: data.user!.id,
      action: e.action,
      target_type: e.targetType,
      target_id: e.targetId,
      metadata: e.metadata ?? {},
    });
    if (error) throw new Error(error.message);
  };
}
