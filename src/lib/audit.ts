import { createClient } from "@/lib/supabase/server";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "client.view_pii"
  | "pdf.export"
  | "price.update"
  | "record.delete"
  | "permission.change";

export interface AuditEvent {
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  /** auth.login / auth.logout 省略時，對使用者所屬的每間公司各寫一筆；其他動作必填 */
  organizationId?: string;
  /** 不得放個資、密碼或 token */
  metadata?: Record<string, string | number | boolean>;
}

/** 以登入使用者的身分寫稽核紀錄（RLS：actor_id 必須等於 auth.uid()）。 */
export async function writeAudit(e: AuditEvent): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("writeAudit 需要登入中的使用者");

  let orgIds: string[];
  if (e.organizationId) {
    orgIds = [e.organizationId];
  } else if (e.action === "auth.login" || e.action === "auth.logout") {
    const { data, error } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id);
    if (error) throw new Error(`讀取所屬公司失敗：${error.message}`);
    orgIds = (data ?? []).map((r) => r.organization_id as string);
  } else {
    throw new Error(`稽核動作 ${e.action} 必須指定 organizationId`);
  }

  if (orgIds.length === 0) return;

  const { error } = await supabase.from("audit_logs").insert(
    orgIds.map((organization_id) => ({
      organization_id,
      actor_id: user.id,
      action: e.action,
      target_type: e.targetType,
      target_id: e.targetId,
      metadata: e.metadata ?? {},
    })),
  );
  if (error) throw new Error(`寫入稽核紀錄失敗：${error.message}`);
}
