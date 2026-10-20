import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectStatus } from "@/db/schema/projects";
import { can, type MemberPerms, type Role } from "@/lib/auth/permissions";
import { decryptField } from "@/lib/crypto/field-encryption";
import { createClient } from "@/lib/supabase/server";
import { throwDbError } from "@/server/db-errors";
import { decryptClientName } from "@/server/pii";

export interface DetailCtx {
  orgId: string;
  role: Role;
  canViewCost?: boolean;
  canViewUnitPrice?: boolean;
  supabase?: SupabaseClient;
}

export interface OrgMember {
  userId: string;
  email: string;
  role: Role;
}

export interface ProjectDetail {
  id: string;
  name: string;
  district: string | null;
  /** 地址解密給所有案場成員（施工需要）；無法解密時為空字串 */
  address: string;
  addressUnreadable: boolean;
  ping: string | null;
  condition: string | null;
  floor: string | null;
  hasElevator: boolean | null;
  hoaRules: string | null;
  status: ProjectStatus;
  /** 只有 client:view_pii 為真才有值；姓名已解密，聯絡資料不帶 */
  client: { id: string; name: string } | null;
  members: OrgMember[];
  /** 可加入的公司成員（已排除現有成員）；無編輯權限者為空 */
  addableMembers: OrgMember[];
  perms: {
    canEdit: boolean;
    canViewPii: boolean;
    canManageMembers: boolean;
    canDeleteFiles: boolean;
  };
}

/** 顯示名稱：email @ 之前的部分 */
export function emailPrefix(email: string): string {
  const i = email.indexOf("@");
  return i > 0 ? email.slice(0, i) : email;
}

function tryDecrypt(v: string | null): { value: string; failed: boolean } {
  if (!v) return { value: "", failed: false };
  try {
    return { value: decryptField(v), failed: false };
  } catch {
    console.error("案場欄位解密失敗"); // 只記固定訊息
    return { value: "", failed: true };
  }
}

export async function listOrgMembers(supabase: SupabaseClient, orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase.rpc("list_org_members", { p_org: orgId });
  if (error) throwDbError(error);
  return ((data ?? []) as { user_id: string; email: string; role: Role }[]).map((m) => ({
    userId: m.user_id,
    email: m.email,
    role: m.role,
  }));
}

/** 找不到或沒有權限（RLS 看不到）回傳 null，由頁面呼叫 notFound()。 */
export async function getProjectDetail(ctx: DetailCtx, id: string): Promise<ProjectDetail | null> {
  const supabase = ctx.supabase ?? (await createClient());
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, district, address_full_enc, ping::text, condition, floor, has_elevator, hoa_rules, status, client_id",
    )
    .eq("id", id)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (error) throwDbError(error);
  if (!data) return null;
  const p = data as unknown as {
    id: string;
    name: string;
    district: string | null;
    address_full_enc: string | null;
    ping: string | null;
    condition: string | null;
    floor: string | null;
    has_elevator: boolean | null;
    hoa_rules: string | null;
    status: ProjectStatus;
    client_id: string | null;
  };

  // 能讀到案場列即代表是案場成員（或公司 admin），RLS 已保證
  const perm: MemberPerms = {
    role: ctx.role,
    canViewCost: ctx.canViewCost ?? false,
    canViewUnitPrice: ctx.canViewUnitPrice ?? false,
    isProjectMember: true,
  };
  const canEdit = can(perm, "project:edit");
  const canViewPii = can(perm, "client:view_pii");

  // R19：姓名與地址的解密不寫稽核；只有電話／Email／身分證的揭露才稽核
  let client: ProjectDetail["client"] = null;
  if (canViewPii && p.client_id) {
    const { data: c, error: ce } = await supabase
      .from("clients")
      .select("name_enc")
      .eq("id", p.client_id)
      .maybeSingle();
    if (ce) throwDbError(ce);
    if (c) {
      let name = "";
      try {
        name = decryptClientName(c as { name_enc: string });
      } catch {
        console.error("業主姓名解密失敗");
      }
      client = { id: p.client_id, name };
    }
  }

  const { data: pm, error: pe } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", id)
    .eq("organization_id", ctx.orgId);
  if (pe) throwDbError(pe);
  const memberIds = new Set(((pm ?? []) as { user_id: string }[]).map((r) => r.user_id));

  const orgMembers = await listOrgMembers(supabase, ctx.orgId);
  const members = orgMembers.filter((m) => memberIds.has(m.userId));
  const addableMembers = canEdit ? orgMembers.filter((m) => !memberIds.has(m.userId)) : [];

  const address = tryDecrypt(p.address_full_enc);
  return {
    id: p.id,
    name: p.name,
    district: p.district,
    address: address.value,
    addressUnreadable: address.failed,
    ping: p.ping,
    condition: p.condition,
    floor: p.floor,
    hasElevator: p.has_elevator,
    hoaRules: p.hoa_rules,
    status: p.status,
    client,
    members,
    addableMembers,
    perms: { canEdit, canViewPii, canManageMembers: canEdit, canDeleteFiles: canEdit },
  };
}
