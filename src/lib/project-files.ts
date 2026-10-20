// 案場檔案的純函式（瀏覽器與伺服器共用，不可引入 server-only）。
import { PROJECT_FILE_KINDS, type ProjectFileKind } from "@/db/schema/projects";

export type FileKind = ProjectFileKind;
export const FILE_KINDS = PROJECT_FILE_KINDS;

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  floor_plan: "平面圖",
  photo: "現場照片",
  rendering: "渲染圖",
  drawing: "圖說",
  other: "其他",
};

export const MAX_UPLOAD_BYTES = 52428800; // 50 MB，與資料庫、bucket 一致
export const SIGNED_URL_SECONDS = 600;
export const STORAGE_BUCKET = "project-files";

/** 與 bucket allowed_mime_types 一致（不含 SVG）。 */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "application/acad",
  "image/vnd.dwg",
  "application/dxf",
  "application/octet-stream",
]);

const CAD_EXT = /\.(dwg|dxf)$/i;

export interface UploadCandidate {
  name: string;
  size: number;
  type: string;
}

export type UploadCheck = { ok: true } | { ok: false; message: string };

/** 實際送給 Storage 與資料庫的 MIME：dwg／dxf 在瀏覽器常為空字串，統一為 octet-stream。 */
export function resolveUploadMime(f: Pick<UploadCandidate, "name" | "type">): string {
  const type = f.type.trim().toLowerCase();
  if (type === "" && CAD_EXT.test(f.name)) return "application/octet-stream";
  return type;
}

export function validateUpload(f: UploadCandidate): UploadCheck {
  if (f.size < 1) return { ok: false, message: "檔案是空的" };
  if (f.size > MAX_UPLOAD_BYTES) return { ok: false, message: "檔案超過 50 MB 上限" };

  const type = f.type.trim().toLowerCase();
  if (/\.svg$/i.test(f.name) || type.startsWith("image/svg")) {
    return { ok: false, message: "不接受 SVG 檔案" };
  }
  const mime = resolveUploadMime(f);
  if (mime === "" || !ALLOWED_MIME.has(mime)) {
    return { ok: false, message: "不支援的檔案類型（可上傳圖片、PDF、DWG、DXF）" };
  }
  return { ok: true };
}

/** 安全檔名：保留中文；移除 / \ 與控制字元、開頭的點與連續的點；空白收合；最長 100 字元。 */
export function safeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[\/]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.{2,}/g, ".")
    .trim();
  const truncated = Array.from(cleaned).slice(0, 100).join("").trim();
  return truncated === "" ? "file" : truncated;
}

/**
 * Storage 的物件鍵只接受 ASCII 的有限字元集（中文會回 InvalidKey），
 * 所以鍵內的檔名把其餘字元換成底線；原始檔名（含中文）存在 project_files.file_name 供顯示。
 */
export function storageKeyName(fileName: string): string {
  const key = safeFileName(fileName)
    .replace(/[^A-Za-z0-9._() -]/g, "_")
    .replace(/_+/g, "_");
  return key === "" ? "file" : key;
}

export function buildStoragePath(
  orgId: string,
  projectId: string,
  kind: FileKind,
  fileName: string,
  uuid: string,
): string {
  return `${orgId}/${projectId}/${kind}/${uuid}-${storageKeyName(fileName)}`;
}
