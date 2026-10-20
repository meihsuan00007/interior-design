import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectStatus } from "@/db/schema/projects";
import { decryptField } from "@/lib/crypto/field-encryption";
import { escapeLike } from "@/lib/escape-like";
import { MAX_QUERY_LENGTH } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";
import { throwDbError } from "@/server/db-errors";
import { canHandleClient, type ProjectWriteCtx } from "./mutations";

export type ProjectStatusFilter = ProjectStatus | "active";

export interface ProjectListRow {
  id: string;
  name: string;
  district: string | null;
  status: ProjectStatus;
  /** 十進位字串（資料庫 numeric 轉文字），不經過浮點數 */
  ping: string | null;
  updatedAt: string;
}

type ListCtx = Pick<ProjectWriteCtx, "orgId" | "supabase">;

/** PostgREST or() 的值以雙引號包住，內部的反斜線與雙引號需再轉義，逗號與括號才不會被當成語法。 */
function quoteForOr(value: string): string {
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** 案場列表：不讀取、不解密任何個資欄位。 */
export async function listProjects(
  ctx: ListCtx,
  filter: { q?: string; status?: ProjectStatusFilter } = {},
): Promise<ProjectListRow[]> {
  const supabase = ctx.supabase ?? (await createClient());
  let query = supabase
    .from("projects")
    .select("id, name, district, status, ping::text, updated_at")
    .eq("organization_id", ctx.orgId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });

  if (filter.status === "active") query = query.neq("status", "archived");
  else if (filter.status) query = query.eq("status", filter.status);

  const q = filter.q?.trim().slice(0, MAX_QUERY_LENGTH);
  if (q) {
    const pattern = quoteForOr(`%${escapeLike(q)}%`);
    query = query.or(`name.ilike.${pattern},district.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) throwDbError(error);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      name: string;
      district: string | null;
      status: ProjectStatus;
      ping: string | null;
      updated_at: string;
    };
    return {
      id: row.id,
      name: row.name,
      district: row.district,
      status: row.status,
      ping: row.ping,
      updatedAt: row.updated_at,
    };
  });
}

export interface ProjectEditData {
  id: string;
  name: string;
  district: string;
  /** 伺服器端解密後的地址；無法解密時為空字串 */
  addressFull: string;
  /** 有地址密文但無法解密 */
  addressUnreadable: boolean;
  ping: string;
  condition: string;
  floor: string;
  hasElevator: boolean | null;
  hoaRules: string;
  status: ProjectStatus;
  hasClient: boolean;
  /** 僅在有 client:view_pii 權限時帶出；電話／Email／身分證一律不帶 */
  clientName: string;
}

function tryDecrypt(v: string | null): { value: string; failed: boolean } {
  if (!v) return { value: "", failed: false };
  try {
    return { value: decryptField(v), failed: false };
  } catch {
    console.error("案場欄位解密失敗"); // 只記固定訊息，不帶密文或例外內容
    return { value: "", failed: true };
  }
}

export async function getProjectForEdit(ctx: ProjectWriteCtx, id: string): Promise<ProjectEditData | null> {
  const supabase: SupabaseClient = ctx.supabase ?? (await createClient());
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

  // 依 Ruling R19：稽核只涵蓋聯絡欄位（電話／Email／身分證）；業主姓名與地址的解密不寫稽核。
  let clientName = "";
  if (p.client_id && canHandleClient(ctx.role)) {
    const { data: c, error: ce } = await supabase.from("clients").select("name_enc").eq("id", p.client_id).maybeSingle();
    if (ce) throwDbError(ce);
    clientName = tryDecrypt((c as { name_enc: string } | null)?.name_enc ?? null).value;
  }

  const address = tryDecrypt(p.address_full_enc);
  return {
    id: p.id,
    name: p.name,
    district: p.district ?? "",
    addressFull: address.value,
    addressUnreadable: address.failed,
    ping: p.ping ?? "",
    condition: p.condition ?? "",
    floor: p.floor ?? "",
    hasElevator: p.has_elevator,
    hoaRules: p.hoa_rules ?? "",
    status: p.status,
    hasClient: p.client_id !== null,
    clientName,
  };
}
