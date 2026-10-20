import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit as defaultWriteAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

/** 可預期的、可直接顯示給使用者的錯誤。 */
export class MasterError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "MasterError";
  }
}

/** 測試可注入；正式環境一律使用帶使用者 JWT 的 client（RLS 生效）。 */
export interface MasterDeps {
  supabase?: SupabaseClient;
  writeAudit?: typeof defaultWriteAudit;
}

export async function getClient(deps?: MasterDeps): Promise<SupabaseClient> {
  return deps?.supabase ?? (await createClient());
}

interface PgErrorLike {
  code?: string;
  message?: string;
}

/** 將資料庫錯誤轉成友善訊息；未知錯誤不帶入原始內容。 */
export function throwDbError(
  error: PgErrorLike,
  messages: { duplicate?: string; inUse?: string } = {},
): never {
  if (error.code === "23505") throw new MasterError(messages.duplicate ?? "資料已存在");
  if (error.code === "23503") throw new MasterError(messages.inUse ?? "資料仍被使用，無法刪除");
  if (error.code === "42501") throw new MasterError("沒有權限");
  throw new Error(`資料庫操作失敗（${error.code ?? "unknown"}）`);
}

/** 更新或刪除時沒有命中任何列：不存在，或被 RLS 擋下。 */
export function assertAffected(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) throw new MasterError("找不到資料，或沒有權限");
}

export async function audit(
  deps: MasterDeps | undefined,
  targetType: string,
  targetId: string,
  organizationId: string,
): Promise<void> {
  await (deps?.writeAudit ?? defaultWriteAudit)({
    action: "record.delete",
    targetType,
    targetId,
    organizationId,
  });
}

/** rpc 函式的錯誤：23503（仍被使用）與 P0002（找不到）使用函式自己的友善訊息。 */
function throwRpcError(error: PgErrorLike): never {
  if ((error.code === "23503" || error.code === "P0002") && error.message) {
    throw new MasterError(error.message);
  }
  throwDbError(error);
}

/** 刪除前先寫稽核（失敗即中止，不刪除）。 */
export async function auditBeforeDelete(
  deps: MasterDeps | undefined,
  targetType: string,
  id: string,
  orgId: string,
): Promise<void> {
  try {
    await audit(deps, targetType, id, orgId);
  } catch {
    throw new Error("稽核寫入失敗，已中止刪除");
  }
}

/** 稽核後呼叫刪除用的資料庫函式（檢查與刪除在函式內同一交易）。 */
export async function auditThenRpc(
  deps: MasterDeps | undefined,
  targetType: string,
  id: string,
  orgId: string,
  fn: "delete_trade" | "delete_unit",
): Promise<void> {
  await auditBeforeDelete(deps, targetType, id, orgId);
  const supabase = await getClient(deps);
  const { error } = await supabase.rpc(fn, { p_id: id });
  if (error) throwRpcError(error);
}

/**
 * 上下移動：依 (sort, created_at, id) 排序找出相鄰項，再以 swap_sort 原子交換。
 * 若兩者 sort 相同（交換無效果），先把整組重編為 10、20、30…（顯示順序不變）。
 */
export async function moveSortable(
  table: "trades" | "units",
  orgId: string,
  id: string,
  direction: "up" | "down",
  deps?: MasterDeps,
): Promise<void> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from(table)
    .select("id, sort")
    .eq("organization_id", orgId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwDbError(error);
  const rows = (data ?? []) as { id: string; sort: number }[];
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) throw new MasterError("找不到資料，或沒有權限");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return;

  if (rows[index].sort === rows[target].sort) {
    for (const [i, row] of rows.entries()) {
      const sort = (i + 1) * 10;
      if (row.sort === sort) continue;
      const { data: updated, error: e } = await supabase
        .from(table)
        .update({ sort })
        .eq("id", row.id)
        .eq("organization_id", orgId)
        .select("id");
      if (e) throwDbError(e);
      assertAffected(updated);
    }
  }

  const { error: swapError } = await supabase.rpc("swap_sort", {
    p_table: table,
    p_a: id,
    p_b: rows[target].id,
  });
  if (swapError) throwRpcError(swapError);
}

/** 確認引用的 id 都屬於目前公司（經 RLS 讀取；筆數必須相符），否則回報欄位錯誤。 */
export async function verifyRefs(
  orgId: string,
  refs: { field: string; table: "trades" | "units" | "vendors"; ids: (string | null)[] }[],
  deps?: MasterDeps,
): Promise<void> {
  const supabase = await getClient(deps);
  const errors: Record<string, string> = {};
  for (const ref of refs) {
    const ids = [...new Set(ref.ids.filter((x): x is string => x !== null))];
    if (ids.length === 0) continue;
    const { count, error } = await supabase
      .from(ref.table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("id", ids);
    if (error) throwDbError(error);
    if (count !== ids.length) errors[ref.field] = "選項無效";
  }
  if (Object.keys(errors).length > 0) throw new MasterError("請修正標示的欄位", errors);
}
