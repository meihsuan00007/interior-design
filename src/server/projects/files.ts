import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit as defaultWriteAudit } from "@/lib/audit";
import { SIGNED_URL_SECONDS, STORAGE_BUCKET, FILE_KINDS, type FileKind } from "@/lib/project-files";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/server/actions";
import { throwDbError } from "@/server/master/common";

export * from "@/lib/project-files";

export interface FileCtx {
  orgId: string;
  supabase?: SupabaseClient;
  writeAudit?: typeof defaultWriteAudit;
}

export interface ProjectFileRow {
  id: string;
  kind: FileKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export async function listProjectFiles(ctx: FileCtx, projectId: string): Promise<ProjectFileRow[]> {
  const supabase = ctx.supabase ?? (await createClient());
  const { data, error } = await supabase
    .from("project_files")
    .select("id, kind, file_name, mime_type, size_bytes, created_at")
    .eq("organization_id", ctx.orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throwDbError(error);
  return (data ?? []).map((r) => {
    const x = r as unknown as {
      id: string;
      kind: FileKind;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      created_at: string;
    };
    return {
      id: x.id,
      kind: x.kind,
      fileName: x.file_name,
      mimeType: x.mime_type,
      sizeBytes: Number(x.size_bytes),
      createdAt: x.created_at,
    };
  });
}

/** 瀏覽器上傳到 Storage 成功後，寫入 project_files 列（RLS 檢查成員身分與 uploaded_by）。 */
export async function recordProjectFile(
  ctx: FileCtx,
  input: {
    projectId: string;
    kind: FileKind;
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<void> {
  if (!FILE_KINDS.includes(input.kind)) throw new UserError("檔案類型無效");
  const supabase = ctx.supabase ?? (await createClient());
  const { error } = await supabase.from("project_files").insert({
    organization_id: ctx.orgId,
    project_id: input.projectId,
    kind: input.kind,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });
  if (error) {
    if (error.code === "23514") throw new UserError("檔案資料不符規定");
    throwDbError(error, { duplicate: "檔案已存在" });
  }
}

/** 簽名下載網址（600 秒）。以使用者的 RLS client 產生，Storage policy 生效。非圖片以附件下載，不在瀏覽器內嵌顯示。 */
export async function createSignedDownloadUrl(ctx: FileCtx, fileId: string): Promise<string> {
  const supabase = ctx.supabase ?? (await createClient());
  const { data: row, error } = await supabase
    .from("project_files")
    .select("storage_path, file_name, mime_type")
    .eq("id", fileId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (error) throwDbError(error);
  if (!row) throw new UserError("找不到檔案，或沒有權限");
  const f = row as { storage_path: string; file_name: string; mime_type: string };
  const isImage = f.mime_type.toLowerCase().startsWith("image/");
  const { data, error: se } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(f.storage_path, SIGNED_URL_SECONDS, isImage ? undefined : { download: f.file_name });
  if (se || !data?.signedUrl) throw new UserError("無法產生下載連結");
  return data.signedUrl;
}

/** 刪除：稽核先於刪除（失敗即中止）→ 刪 Storage 物件 → 刪資料列。 */
export async function deleteProjectFile(ctx: FileCtx, fileId: string): Promise<void> {
  const supabase = ctx.supabase ?? (await createClient());
  const { data: row, error } = await supabase
    .from("project_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (error) throwDbError(error);
  if (!row) throw new UserError("找不到檔案，或沒有權限");
  const path = (row as { storage_path: string }).storage_path;

  try {
    await (ctx.writeAudit ?? defaultWriteAudit)({
      action: "record.delete",
      targetType: "project_file",
      targetId: fileId,
      organizationId: ctx.orgId,
    });
  } catch {
    throw new Error("稽核寫入失敗，已中止刪除");
  }

  // 先刪資料列（RLS：只有案場編輯者），成功後再清 Storage；物件清除失敗只記固定訊息
  const { data: deleted, error: de } = await supabase
    .from("project_files")
    .delete()
    .eq("id", fileId)
    .eq("organization_id", ctx.orgId)
    .select("id");
  if (de) throwDbError(de);
  if (!deleted || deleted.length === 0) throw new UserError("找不到檔案，或沒有權限");

  const { error: re } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (re) console.error("刪除 Storage 物件失敗");
}
