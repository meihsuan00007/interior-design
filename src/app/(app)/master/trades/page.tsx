import { listTrades } from "@/server/master/trades";
import { getMasterPageContext } from "../_components/page-context";
import { TradesManager } from "./view";

export default async function TradesPage() {
  const { orgId, canEdit } = await getMasterPageContext();
  const trades = await listTrades(orgId);
  return <TradesManager trades={trades} canEdit={canEdit} />;
}
