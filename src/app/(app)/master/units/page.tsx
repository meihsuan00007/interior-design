import { listUnits } from "@/server/master/units";
import { getMasterPageContext } from "../_components/page-context";
import { UnitsManager } from "./view";

export default async function UnitsPage() {
  const { orgId, canEdit } = await getMasterPageContext();
  const units = await listUnits(orgId);
  return <UnitsManager units={units} canEdit={canEdit} />;
}
