import "server-only";
import { revealClientContact, type RevealDeps } from "@/server/pii";
import { canHandleClient, getProjectClientId, type ProjectWriteCtx } from "./mutations";

export type RevealResult =
  | { ok: true; phone: string | null; email: string | null; nationalId: string | null }
  | { ok: false; message: string };

/**
 * 揭露電話／Email／身分證的守門：角色須可處理業主區塊，且 clientId 由案場經 RLS 取得
 * （不信任輸入）。任何一關沒過都不寫稽核；通過後才由 revealClientContact 先稽核再讀取。
 */
export async function revealForProject(
  ctx: ProjectWriteCtx,
  projectId: string,
  deps: RevealDeps = {},
): Promise<RevealResult> {
  if (!canHandleClient(ctx.role)) return { ok: false, message: "沒有權限" };
  const clientId = await getProjectClientId(ctx, projectId);
  if (!clientId) return { ok: false, message: "找不到業主" };
  const r = await revealClientContact(clientId, ctx.orgId, { supabase: ctx.supabase, ...deps });
  return { ok: true, ...r };
}
