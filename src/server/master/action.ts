import "server-only";
import { runWrite } from "@/server/actions";

// 共用部分已搬到 @/server/actions；這裡保留主檔既有的匯入路徑。
export {
  formBool,
  formInt,
  formNullable,
  formString,
  validationFailure,
  VALIDATION_MESSAGE,
  zodFieldErrors,
  type ActionResult,
} from "@/server/actions";

/** 主檔寫入：admin／designer 才能執行。 */
export function runMasterWrite(revalidate: string, fn: (orgId: string) => Promise<void>) {
  return runWrite({ revalidate, roles: ["admin", "designer"], label: "主檔操作失敗" }, (org) =>
    fn(org.organizationId),
  );
}
