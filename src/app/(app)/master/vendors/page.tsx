import { listTrades } from "@/server/master/trades";
import { listVendors } from "@/server/master/vendors";
import { getMasterPageContext } from "../_components/page-context";
import { VendorsManager } from "./view";

export default async function VendorsPage() {
  const { orgId, canEdit } = await getMasterPageContext();
  const [vendors, trades] = await Promise.all([listVendors(orgId), listTrades(orgId)]);

  // 完整電話只送給有編輯權限者（供編輯表單使用）；監工只拿到遮罩後的電話
  const rows = vendors.map((v) => ({ ...v, phone: canEdit ? v.phone : "" }));

  return <VendorsManager vendors={rows} trades={trades.map((t) => ({ id: t.id, name: t.name }))} canEdit={canEdit} />;
}
