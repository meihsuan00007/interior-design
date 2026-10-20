import "server-only";
import type { TradeInput } from "@/lib/validation/master";
import {
  assertAffected,
  auditThenRpc,
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
  // 檢查品項、刪除、清理廠商 trade_ids 在資料庫函式內同一交易完成
  await auditThenRpc(deps, "trade", id, orgId, "delete_trade");
}
