import "server-only";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import type { Role } from "@/lib/auth/permissions";
import { UserError } from "@/server/db-errors";
import {
  ForbiddenError,
  getAppContext,
  getCurrentOrgFromCookie,
  requireOrgRole,
  type AppContext,
  type Membership,
} from "@/server/context";

export { UserError };

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const VALIDATION_MESSAGE = "請修正標示的欄位";

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validationFailure(error: ZodError): ActionResult {
  return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: zodFieldErrors(error) };
}

/**
 * 寫入動作的共同流程：驗證登入 → 以 cookie 解析目前公司（不信任表單的公司 id）
 * → 角色檢查 → 執行 → 重新整理頁面。所有可預期錯誤轉成 ActionResult，不往外拋。
 */
export async function runWrite(
  opts: { revalidate: string; roles: Role[]; label: string },
  fn: (org: Membership, ctx: AppContext) => Promise<void>,
): Promise<ActionResult> {
  const ctx = await getAppContext(); // 未登入時 redirect（不可被下面的 try 吞掉）
  try {
    const org = await getCurrentOrgFromCookie(ctx);
    requireOrgRole(ctx, org.organizationId, opts.roles);
    await fn(org, ctx);
    revalidatePath(opts.revalidate);
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, message: "沒有權限" };
    if (e instanceof UserError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors };
    console.error(opts.label, e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "操作失敗，請稍後再試" };
  }
}

export function formString(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export function formBool(fd: FormData, name: string): boolean {
  return fd.get(name) === "on" || fd.get(name) === "true";
}

/** 空字串視為 null（下拉「未指定」）。 */
export function formNullable(fd: FormData, name: string): string | null {
  const v = formString(fd, name);
  return v === "" ? null : v;
}

/** 整數欄位：空白視為 0；非數字回傳 NaN 交給 zod 報錯。 */
export function formInt(fd: FormData, name: string): number {
  const v = formString(fd, name).trim();
  if (v === "") return 0;
  return /^-?\d+$/.test(v) ? Number(v) : Number.NaN;
}
