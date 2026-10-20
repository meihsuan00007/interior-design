import "server-only";
import { escapeLike } from "@/lib/escape-like";
import { MAX_QUERY_LENGTH } from "@/lib/limits";
import type { CatalogItemInput, PricingMethod } from "@/lib/validation/master";
import { assertAffected, throwDbError } from "@/server/db-errors";
import {
  auditBeforeDelete,
  getClient,
  verifyRefs,
  type MasterDeps,
} from "./common";

const DUPLICATE = "名稱已存在";

function catalogRefs(i: CatalogItemInput) {
  return [
    { field: "tradeId", table: "trades" as const, ids: [i.tradeId] },
    { field: "unitId", table: "units" as const, ids: [i.unitId] },
    { field: "defaultVendorId", table: "vendors" as const, ids: [i.defaultVendorId] },
  ];
}

export interface CatalogItemRow {
  id: string;
  name: string;
  tradeId: string | null;
  unitId: string | null;
  spec: string;
  defaultVendorId: string | null;
  pricingMethod: PricingMethod;
  note: string;
}

export interface CatalogFilter {
  tradeId?: string;
  q?: string;
}

const COLUMNS = "id, name, trade_id, unit_id, spec, default_vendor_id, pricing_method, note";

interface DbItem {
  id: string;
  name: string;
  trade_id: string | null;
  unit_id: string | null;
  spec: string | null;
  default_vendor_id: string | null;
  pricing_method: PricingMethod;
  note: string | null;
}

const toRow = (r: DbItem): CatalogItemRow => ({
  id: r.id,
  name: r.name,
  tradeId: r.trade_id,
  unitId: r.unit_id,
  spec: r.spec ?? "",
  defaultVendorId: r.default_vendor_id,
  pricingMethod: r.pricing_method,
  note: r.note ?? "",
});

const toDb = (i: CatalogItemInput) => ({
  name: i.name,
  trade_id: i.tradeId,
  unit_id: i.unitId,
  spec: i.spec === "" ? null : i.spec,
  default_vendor_id: i.defaultVendorId,
  pricing_method: i.pricingMethod,
  note: i.note === "" ? null : i.note,
});

export async function listCatalogItems(
  orgId: string,
  filter: CatalogFilter = {},
  deps?: MasterDeps,
): Promise<CatalogItemRow[]> {
  const supabase = await getClient(deps);
  let query = supabase
    .from("catalog_items")
    .select(COLUMNS)
    .eq("organization_id", orgId)
    .order("name", { ascending: true });
  if (filter.tradeId) query = query.eq("trade_id", filter.tradeId);
  const q = filter.q?.trim().slice(0, MAX_QUERY_LENGTH);
  if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
  const { data, error } = await query;
  if (error) throwDbError(error);
  return ((data ?? []) as DbItem[]).map(toRow);
}

export async function createCatalogItem(
  orgId: string,
  input: CatalogItemInput,
  deps?: MasterDeps,
): Promise<CatalogItemRow> {
  await verifyRefs(orgId, catalogRefs(input), deps);
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("catalog_items")
    .insert({ ...toDb(input), organization_id: orgId })
    .select(COLUMNS)
    .single();
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  return toRow(data as DbItem);
}

export async function updateCatalogItem(
  orgId: string,
  id: string,
  input: CatalogItemInput,
  deps?: MasterDeps,
): Promise<void> {
  await verifyRefs(orgId, catalogRefs(input), deps);
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("catalog_items")
    .update(toDb(input))
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  assertAffected(data);
}

export async function deleteCatalogItem(orgId: string, id: string, deps?: MasterDeps): Promise<void> {
  await auditBeforeDelete(deps, "catalog_item", id, orgId);
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("catalog_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { inUse: "此品項已被報價引用，無法刪除" });
  assertAffected(data);
}
