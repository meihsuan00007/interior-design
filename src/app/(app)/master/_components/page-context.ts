import "server-only";
import { getAppContext, getCurrentOrgFromCookie } from "@/server/context";

/** 主檔頁面共用：解析目前公司與是否可編輯（監工唯讀）。 */
export async function getMasterPageContext() {
  const ctx = await getAppContext();
  const org = await getCurrentOrgFromCookie(ctx);
  return { orgId: org.organizationId, canEdit: org.role === "admin" || org.role === "designer" };
}
