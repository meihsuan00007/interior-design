import "server-only";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import type { VendorInput } from "@/lib/validation/master";
import { maskPhone } from "@/server/pii";
import {
  assertAffected,
  auditBeforeDelete,
  getClient,
  throwDbError,
  verifyRefs,
  type MasterDeps,
} from "./common";

const DUPLICATE = "名稱已存在";

/** phoneTouched 為 false 時不更新電話（避免把無法解密的舊密文覆蓋成空值）；未指定視為有改。 */
export type VendorUpdateInput = VendorInput & { phoneTouched?: boolean };

export interface VendorRow {
  id: string;
  name: string;
  tradeIds: string[];
  contactName: string;
  /** 完整電話（已解密）；僅供有編輯權限者的表單使用，列表請用 phoneMasked */
  phone: string;
  phoneMasked: string;
  taxId: string;
  note: string;
}

const COLUMNS = "id, name, trade_ids, contact_name, phone_enc, tax_id, note";

interface DbVendor {
  id: string;
  name: string;
  trade_ids: string[];
  contact_name: string | null;
  phone_enc: string | null;
  tax_id: string | null;
  note: string | null;
}

function toRow(r: DbVendor): VendorRow {
  // 廠商電話不是業主個資，解密不寫 client.view_pii 稽核
  let phone = "";
  let unreadable = false;
  if (r.phone_enc) {
    try {
      phone = decryptField(r.phone_enc);
    } catch {
      // 密文損毀或為種子佔位字串：不讓整個列表壞掉，電話以遮罩顯示
      unreadable = true;
    }
  }
  return {
    id: r.id,
    name: r.name,
    tradeIds: r.trade_ids ?? [],
    contactName: r.contact_name ?? "",
    phone,
    phoneMasked: unreadable ? "***" : phone ? maskPhone(phone) : "",
    taxId: r.tax_id ?? "",
    note: r.note ?? "",
  };
}

function toDb(i: VendorUpdateInput) {
  const phone = i.phone.trim();
  const phonePart = i.phoneTouched === false ? {} : { phone_enc: phone === "" ? null : encryptField(phone) };
  return {
    name: i.name,
    trade_ids: i.tradeIds,
    contact_name: i.contactName === "" ? null : i.contactName,
    ...phonePart,
    tax_id: i.taxId === "" ? null : i.taxId,
    note: i.note === "" ? null : i.note,
  };
}

export async function listVendors(orgId: string, deps?: MasterDeps): Promise<VendorRow[]> {
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("vendors")
    .select(COLUMNS)
    .eq("organization_id", orgId)
    .order("name", { ascending: true });
  if (error) throwDbError(error);
  return ((data ?? []) as DbVendor[]).map(toRow);
}

export async function createVendor(orgId: string, input: VendorInput, deps?: MasterDeps): Promise<VendorRow> {
  await verifyRefs(orgId, [{ field: "tradeIds", table: "trades", ids: input.tradeIds }], deps);
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("vendors")
    .insert({ ...toDb(input), organization_id: orgId })
    .select(COLUMNS)
    .single();
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  return toRow(data as DbVendor);
}

export async function updateVendor(orgId: string, id: string, input: VendorUpdateInput, deps?: MasterDeps): Promise<void> {
  await verifyRefs(orgId, [{ field: "tradeIds", table: "trades", ids: input.tradeIds }], deps);
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("vendors")
    .update(toDb(input))
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { duplicate: DUPLICATE });
  assertAffected(data);
}

export async function deleteVendor(orgId: string, id: string, deps?: MasterDeps): Promise<void> {
  await auditBeforeDelete(deps, "vendor", id, orgId);
  const supabase = await getClient(deps);
  const { data, error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throwDbError(error, { inUse: "此廠商已有報價文件，無法刪除" });
  assertAffected(data);
}
