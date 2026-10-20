import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { can, type Role } from "@/lib/auth/permissions";
import { encryptField } from "@/lib/crypto/field-encryption";
import { createClient } from "@/lib/supabase/server";
import type { ProjectInput } from "@/lib/validation/project";
import { assertAffected, throwDbError, throwRpcError, UserError } from "@/server/db-errors";
import { encryptClientPii } from "@/server/pii";

/** 寫入情境：orgId 必須來自 getCurrentOrg，role 為該公司的角色。supabase 僅供測試注入。 */
export interface ProjectWriteCtx {
  orgId: string;
  role: Role;
  supabase?: SupabaseClient;
}

/** 此角色能否處理業主區塊（伺服器端判斷；監工完全忽略業主欄位）。 */
export function canHandleClient(role: Role): boolean {
  return can({ role, canViewCost: false, canViewUnitPrice: false, isProjectMember: true }, "client:view_pii");
}

const blankToNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

function projectColumns(i: ProjectInput) {
  return {
    name: i.name,
    district: blankToNull(i.district),
    address_full_enc: i.addressFull.trim() === "" ? null : encryptField(i.addressFull.trim()),
    // 坪數以字串送出，由資料庫 numeric 解析（不經過 number）
    ping: i.ping === "" ? null : i.ping,
    condition: i.condition === "" ? null : i.condition,
    floor: blankToNull(i.floor),
    has_elevator: i.hasElevator,
    hoa_rules: blankToNull(i.hoaRules),
    status: i.status,
  };
}

/** 編輯：只有使用者動過地址欄位才更新 address_full_enc（避免無法解密的舊值被空白蓋掉）。 */
function editColumns(i: ProjectInput) {
  const { address_full_enc, ...rest } = projectColumns(i);
  return i.addressTouched ? { ...rest, address_full_enc } : rest;
}

function encryptInputClient(i: ProjectInput) {
  return encryptClientPii({
    name: i.clientName,
    phone: i.clientPhone,
    email: i.clientEmail,
    nationalId: i.clientNationalId,
  });
}

async function createClientFor(supabase: SupabaseClient, projectId: string, i: ProjectInput): Promise<void> {
  const p = encryptInputClient(i);
  const { error } = await supabase.rpc("create_client_for_project", {
    p_project: projectId,
    p_name_enc: p.nameEnc,
    p_phone_enc: p.phoneEnc,
    p_email_enc: p.emailEnc,
    p_national_id_enc: p.nationalIdEnc,
    p_name_bidx: p.nameBidx,
    p_phone_bidx: p.phoneBidx,
    p_email_bidx: p.emailBidx,
    p_national_id_bidx: p.nationalIdBidx,
  });
  if (error) throwRpcError(error);
}

export async function createProject(ctx: ProjectWriteCtx, input: ProjectInput): Promise<string> {
  const supabase = ctx.supabase ?? (await createClient());
  const c = projectColumns(input);
  const { data, error } = await supabase.rpc("create_project", {
    p_org: ctx.orgId,
    p_name: c.name,
    p_district: c.district,
    p_address_full_enc: c.address_full_enc,
    p_ping: c.ping,
    p_condition: c.condition,
    p_floor: c.floor,
    p_has_elevator: c.has_elevator,
    p_hoa_rules: c.hoa_rules,
    p_status: c.status,
  });
  if (error) throwRpcError(error);
  const id = data as string;

  if (canHandleClient(ctx.role) && input.clientName !== "") {
    try {
      await createClientFor(supabase, id, input);
    } catch (e) {
      // 業主建立失敗：盡力移除剛建好的案場（經 RLS），避免使用者重送時重複建立
      const { error: cleanupError } = await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("organization_id", ctx.orgId);
      if (cleanupError) console.error("業主建立失敗後移除案場也失敗");
      throw e;
    }
  }
  return id;
}

export async function updateProject(ctx: ProjectWriteCtx, id: string, input: ProjectInput): Promise<void> {
  const supabase = ctx.supabase ?? (await createClient());
  const { data, error } = await supabase
    .from("projects")
    .update(editColumns(input))
    .eq("id", id)
    .eq("organization_id", ctx.orgId)
    .select("id, client_id");
  if (error) throwRpcError(error);
  assertAffected(data);

  if (!canHandleClient(ctx.role)) return;
  const clientId = (data![0] as { client_id: string | null }).client_id;

  if (!clientId) {
    if (input.clientName !== "") await createClientFor(supabase, id, input);
    return;
  }

  // 已有業主：只更新有填的欄位。電話／Email／身分證留空 = 不變更（清除功能留給 Task 6 的明確操作）
  const hasAny = [input.clientName, input.clientPhone, input.clientEmail, input.clientNationalId].some(
    (v) => v.trim() !== "",
  );
  if (!hasAny) return;
  if (input.clientName === "") throw new UserError("請修正標示的欄位", { clientName: "請填寫業主姓名" });

  const p = encryptInputClient(input);
  const patch: Record<string, string | null> = { name_enc: p.nameEnc, name_bidx: p.nameBidx };
  if (p.phoneEnc) Object.assign(patch, { phone_enc: p.phoneEnc, phone_bidx: p.phoneBidx });
  if (p.emailEnc) Object.assign(patch, { email_enc: p.emailEnc, email_bidx: p.emailBidx });
  if (p.nationalIdEnc) Object.assign(patch, { national_id_enc: p.nationalIdEnc, national_id_bidx: p.nationalIdBidx });

  const { data: updated, error: e2 } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", clientId)
    .eq("organization_id", ctx.orgId)
    .select("id");
  if (e2) throwDbError(e2);
  assertAffected(updated);
}

export type ContactField = "phone" | "email" | "national_id";
const CONTACT_FIELDS: ContactField[] = ["phone", "email", "national_id"];

/** 案場的業主 id（經 RLS 讀取；看不到案場或沒有業主回傳 null）。 */
export async function getProjectClientId(ctx: ProjectWriteCtx, projectId: string): Promise<string | null> {
  const supabase = ctx.supabase ?? (await createClient());
  const { data, error } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (error) throwDbError(error);
  return (data as { client_id: string | null } | null)?.client_id ?? null;
}

/** R16：明確清除單一聯絡欄位（密文與盲索引一併設為 null）。僅能處理業主區塊的角色可呼叫。 */
export async function clearClientContactField(
  ctx: ProjectWriteCtx,
  projectId: string,
  field: ContactField,
): Promise<void> {
  if (!CONTACT_FIELDS.includes(field)) throw new UserError("欄位無效");
  if (!canHandleClient(ctx.role)) throw new UserError("沒有權限");
  const clientId = await getProjectClientId(ctx, projectId);
  if (!clientId) throw new UserError("找不到業主");
  const supabase = ctx.supabase ?? (await createClient());
  const { data, error } = await supabase
    .from("clients")
    .update({ [`${field}_enc`]: null, [`${field}_bidx`]: null })
    .eq("id", clientId)
    .eq("organization_id", ctx.orgId)
    .select("id");
  if (error) throwDbError(error);
  assertAffected(data);
}

/** 指派／移除案場成員。資料庫函式的錯誤轉成中文訊息。 */
export async function setProjectMember(
  ctx: ProjectWriteCtx,
  projectId: string,
  userId: string,
  add: boolean,
): Promise<void> {
  const supabase = ctx.supabase ?? (await createClient());
  const { error } = await supabase.rpc("set_project_member", { p_project: projectId, p_user: userId, p_add: add });
  if (!error) return;
  throwRpcError(error, {
    invalid: "成員設定無效",
    byHint: {
      not_org_member: "此使用者不屬於本公司",
      last_editor: "案場至少需保留一位可編輯者",
    },
  });
}
