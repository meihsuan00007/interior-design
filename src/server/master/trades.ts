import "server-only";
import type { TradeInput } from "@/lib/validation/master";
import {
  MasterError,
  assertAffected,
  audit,
  getClient,
  moveSortable,
  throwDbError,
  type MasterDeps,
} from "./common";

export interface TradeRow {
  id: string;
  name: string;
  sort: number;
  defaultIncludeInMgmtFee: boolean;
  isProxyPurchase: boolean;
}

const COLUMNS = "id, name, sort, default_include_in_mgmt_fee, is_proxy_purchase";
const DUPLICATE = "名稱已存在";

interface DbTrade {
  id: string;
  name: string;
  sort: number;
  default_include_in_mgmt_fee: boolean;
  is_proxy_purchase: boolean;
}

const toRow = (r: DbTrade): TradeRow => ({
  id: r.id,
  name: r.name,
  sort: r.sort,
  defaultIncludeInMgmtFee: r.default_include_in_mgmt_fee,
  isProxyPurchase: r.is_proxy_purchase,
});

const toDb = (i: TradeInput) => ({
  name: i.name,
  sort: i.sort,
  default_include_in_mgmt_fee: i.defaultIncludeInMgmtFee,
  is_proxy_purchase: i.isProxyPurchase,
});

export async function listTrades(orgId: string, deps?: MasterDeps): Promise<TradeRow[]> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("trades")
    .select(COLUMNS)
    .eq("organization_id", orgId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throwDbError(error);
  return ((data ?? []) as DbTrade[]).map(toRow);
}

export async function createTrade(orgId: string, input: TradeInput, deps?: MasterDeps): Promise<TradeRow> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("trades")
    .insert({ ...toDb(input), organization_id: orgId })
    .select(COLUMNS)
    .single();
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  return toRow(data as DbTrade);
}

export async function updateTrade(orgId: string, id: string, input: TradeInput, deps?: MasterDeps): Promise<void> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("trades")
    .update(toDb(input))
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  assertAffected(data);
}

export async function moveTrade(orgId: string, id: string, direction: "up" | "down", deps?: MasterDeps) {
  await moveSortable("trades", orgId, id, direction, deps);
}

export async function deleteTrade(orgId: string, id: string, deps?: MasterDeps): Promise<void> {
  const supabase = await getClient(deps);

  // 品項外鍵為 ON DELETE SET NULL，不先檢查會默默讓品項失去工種
  const { count, error: countError } = await supabase
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("trade_id", id);
  if (countError) throwDbError(countError);
  if ((count ?? 0) > 0) throw new MasterError("此工種仍有品項使用，無法刪除");

  const { data, error } = await supabase
    .from("trades")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { inUse: "此工種仍被使用，無法刪除" });
  assertAffected(data);

  // vendors.trade_ids 是 uuid 陣列（沒有外鍵），一併移除殘留的參照
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, trade_ids")
    .eq("organization_id", orgId)
    .contains("trade_ids", [id]);
  for (const v of (vendors ?? []) as { id: string; trade_ids: string[] }[]) {
    await supabase
      .from("vendors")
      .update({ trade_ids: v.trade_ids.filter((t) => t !== id) })
      .eq("id", v.id)
      .eq("organization_id", orgId);
  }

  await audit(deps, "trade", id, orgId);
}
