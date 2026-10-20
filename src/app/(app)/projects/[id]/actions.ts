"use server";

import { z } from "zod";
import { recordFileSchema } from "@/lib/validation/project-file";
import { runWrite, UserError, type ActionResult } from "@/server/actions";
import { ForbiddenError, getAppContext, getCurrentOrgFromCookie, requireOrgRole } from "@/server/context";
import { createSignedDownloadUrl, deleteProjectFile, recordProjectFile } from "@/server/projects/files";
import {
  clearClientContactField,
  setProjectMember,
} from "@/server/projects/mutations";
import type { RevealResult } from "@/server/projects/reveal";
import { revealForProject } from "@/server/projects/reveal";

const uuid = z.uuid();
const EDITORS = ["admin", "designer"] as ("admin" | "designer")[];
const ALL_ROLES = ["admin", "designer", "supervisor"] as ("admin" | "designer" | "supervisor")[];


export async function revealContactAction(projectId: string): Promise<RevealResult> {
  const ctx = await getAppContext();
  try {
    if (!uuid.safeParse(projectId).success) return { ok: false, message: "找不到案場" };
    const org = await getCurrentOrgFromCookie(ctx);
    requireOrgRole(ctx, org.organizationId, EDITORS);
    return await revealForProject({ orgId: org.organizationId, role: org.role }, projectId);
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

export async function recordFileAction(raw: z.input<typeof recordFileSchema>): Promise<ActionResult> {
  const parsed = recordFileSchema.safeParse(raw);
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
    deleteProjectFile({ orgId: org.organizationId }, fileId, projectId),
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

