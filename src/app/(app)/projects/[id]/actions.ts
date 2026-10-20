"use server";

import { z } from "zod";
import { FILE_KINDS } from "@/lib/project-files";
import { runWrite, UserError, type ActionResult } from "@/server/actions";
import { ForbiddenError, getAppContext, getCurrentOrgFromCookie, requireOrgRole } from "@/server/context";
import { createSignedDownloadUrl, deleteProjectFile, recordProjectFile } from "@/server/projects/files";
import {
  canHandleClient,
  clearClientContactField,
  getProjectClientId,
  setProjectMember,
} from "@/server/projects/mutations";
import { revealClientContact } from "@/server/pii";

const uuid = z.uuid();
const EDITORS = ["admin", "designer"] as ("admin" | "designer")[];
const ALL_ROLES = ["admin", "designer", "supervisor"] as ("admin" | "designer" | "supervisor")[];

export type RevealResult =
  | { ok: true; phone: string | null; email: string | null; nationalId: string | null }
  | { ok: false; message: string };

/** 揭露電話／Email／身分證：先寫稽核（失敗即中止），再回傳明文。clientId 由案場經 RLS 取得，不信任輸入。 */
export async function revealContactAction(projectId: string): Promise<RevealResult> {
  const ctx = await getAppContext();
  try {
    if (!uuid.safeParse(projectId).success) return { ok: false, message: "找不到案場" };
    const org = await getCurrentOrgFromCookie(ctx);
    if (!canHandleClient(org.role)) return { ok: false, message: "沒有權限" };
    requireOrgRole(ctx, org.organizationId, EDITORS);
    const clientId = await getProjectClientId({ orgId: org.organizationId, role: org.role }, projectId);
    if (!clientId) return { ok: false, message: "找不到業主" };
    const r = await revealClientContact(clientId, org.organizationId);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, message: "沒有權限" };
    console.error("揭露業主聯絡資料失敗", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "無法顯示聯絡資料，請稍後再試" };
  }
}

export async function clearContactAction(projectId: string, field: string): Promise<ActionResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, message: "找不到案場" };
  if (field !== "phone" && field !== "email" && field !== "national_id") return { ok: false, message: "欄位無效" };
  return runWrite({ revalidate: `/projects/${projectId}`, roles: EDITORS, label: "清除聯絡欄位失敗" }, (org) =>
    clearClientContactField({ orgId: org.organizationId, role: org.role }, projectId, field),
  );
}

export async function setMemberAction(projectId: string, userId: string, add: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(userId).success) {
    return { ok: false, message: "找不到案場或使用者" };
  }
  return runWrite({ revalidate: `/projects/${projectId}`, roles: EDITORS, label: "成員設定失敗" }, (org) =>
    setProjectMember({ orgId: org.organizationId, role: org.role }, projectId, userId, add),
  );
}

const recordSchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(FILE_KINDS),
  storagePath: z.string().min(1).max(600),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(52428800),
});

export async function recordFileAction(raw: z.input<typeof recordSchema>): Promise<ActionResult> {
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "檔案資料無效" };
  const input = parsed.data;
  return runWrite({ revalidate: `/projects/${input.projectId}`, roles: ALL_ROLES, label: "登錄檔案失敗" }, async (org) => {
    // 監工只能登錄照片（資料庫 RLS 亦會擋）
    if (org.role === "supervisor" && input.kind !== "photo") throw new UserError("沒有權限");
    await recordProjectFile({ orgId: org.organizationId }, input);
  });
}

export async function deleteFileAction(projectId: string, fileId: string): Promise<ActionResult> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(fileId).success) {
    return { ok: false, message: "找不到檔案" };
  }
  return runWrite({ revalidate: `/projects/${projectId}`, roles: EDITORS, label: "刪除檔案失敗" }, (org) =>
    deleteProjectFile({ orgId: org.organizationId }, fileId),
  );
}

export type UrlResult = { ok: true; url: string } | { ok: false; message: string };

export async function signedUrlAction(fileId: string): Promise<UrlResult> {
  const ctx = await getAppContext();
  try {
    if (!uuid.safeParse(fileId).success) return { ok: false, message: "找不到檔案" };
    const org = await getCurrentOrgFromCookie(ctx);
    return { ok: true, url: await createSignedDownloadUrl({ orgId: org.organizationId }, fileId) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    console.error("產生下載連結失敗", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "無法產生下載連結" };
  }
}

