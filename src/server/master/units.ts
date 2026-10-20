import "server-only";
import type { UnitInput } from "@/lib/validation/master";
import {
  MasterError,
  assertAffected,
  audit,
  getClient,
  moveSortable,
  throwDbError,
  type MasterDeps,
} from "./common";

export interface UnitRow {
  id: string;
  name: string;
  sort: number;
}

const DUPLICATE = "名稱已存在";

export async function listUnits(orgId: string, deps?: MasterDeps): Promise<UnitRow[]> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("units")
    .select("id, name, sort")
    .eq("organization_id", orgId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throwDbError(error);
  return (data ?? []) as UnitRow[];
}

export async function createUnit(orgId: string, input: UnitInput, deps?: MasterDeps): Promise<UnitRow> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("units")
    .insert({ name: input.name, sort: input.sort, organization_id: orgId })
    .select("id, name, sort")
    .single();
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  return data as UnitRow;
}

export async function updateUnit(orgId: string, id: string, input: UnitInput, deps?: MasterDeps): Promise<void> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("units")
    .update({ name: input.name, sort: input.sort })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  assertAffected(data);
}

export async function moveUnit(orgId: string, id: string, direction: "up" | "down", deps?: MasterDeps) {
  await moveSortable("units", orgId, id, direction, deps);
}

export async function deleteUnit(orgId: string, id: string, deps?: MasterDeps): Promise<void> {
  const supabase = await getClient(deps);

  const { count, error: countError } = await supabase
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("unit_id", id);
  if (countError) throwDbError(countError);
  if ((count ?? 0) > 0) throw new MasterError("此單位仍有品項使用，無法刪除");

  const { data, error } = await supabase
    .from("units")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { inUse: "此單位仍被使用，無法刪除" });
  assertAffected(data);
  await audit(deps, "unit", id, orgId);
}
