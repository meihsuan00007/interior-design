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

/** 上下移動：依 (sort, created_at) 排序後交換位置，並把整組重編為 10、20、30… */
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
  [rows[index], rows[target]] = [rows[target], rows[index]];
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
