"use client";

import { Camera, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildStoragePath,
  safeFileName,
  FILE_KINDS,
  FILE_KIND_LABEL,
  resolveUploadMime,
  STORAGE_BUCKET,
  validateUpload,
  type FileKind,
} from "@/lib/project-files";
import { createClient } from "@/lib/supabase/client";
import { deleteFileAction, recordFileAction, signedUrlAction } from "./actions";
import { ConfirmDialog } from "./confirm";

export interface FileView {
  id: string;
  kind: FileKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** 圖片的縮圖簽名網址 */
  thumbUrl: string | null;
}

function sizeLabel(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function FilesCard({
  orgId,
  projectId,
  files,
  canUploadAll,
  canDelete,
}: {
  orgId: string;
  projectId: string;
  files: FileView[];
  /** 設計師／admin 可上傳任何類型；監工只能上傳照片 */
  canUploadAll: boolean;
  canDelete: boolean;
}) {
  const [kind, setKind] = useState<FileKind>(canUploadAll ? "floor_plan" : "photo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<FileView | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null, uploadKind: FileKind) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of picked) {
        const check = validateUpload({ name: file.name, size: file.size, type: file.type });
        if (!check.ok) {
          setError(`${file.name}：${check.message}`);
          continue;
        }
        const mime = resolveUploadMime({ name: file.name, type: file.type });
        if (uploadKind === "photo" && !mime.startsWith("image/")) {
          setError(`${file.name}：現場照片只能上傳圖片`);
          continue;
        }
        const path = buildStoragePath(orgId, projectId, uploadKind, file.name, crypto.randomUUID());
        const { error: upError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { contentType: mime, upsert: false });
        if (upError) {
          setError(`${file.name}：上傳失敗`);
          continue;
        }
        const r = await recordFileAction({
          projectId,
          kind: uploadKind,
          storagePath: path,
          fileName: safeFileName(file.name),
          mimeType: mime,
          sizeBytes: file.size,
        });
        if (!r.ok) {
          setError(`${file.name}：${r.message}`);
          const { error: rmError } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
          if (rmError) console.error("移除未登錄的上傳檔案失敗");
        }
      }
    } finally {
      setBusy(false);
      if (pickRef.current) pickRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function download(f: FileView) {
    setError(null);
    // 行動瀏覽器會擋下 await 之後才開的視窗：先在點擊當下同步開空白視窗，取得網址後再導向
    const w = window.open("", "_blank");
    if (w) w.opener = null;
    startTransition(async () => {
      const r = await signedUrlAction(f.id);
      if (!r.ok) {
        w?.close();
        return setError(r.message);
      }
      if (w) w.location.href = r.url;
      else window.location.href = r.url;
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    startTransition(async () => {
      const r = await deleteFileAction(projectId, deleting.id);
      if (!r.ok) return setDeleteError(r.message);
      setDeleting(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>檔案</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {canUploadAll && (
              <>
                <select
                  aria-label="檔案類型"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as FileKind)}
                  className="h-10 rounded-lg border bg-background px-2 text-sm"
                >
                  {FILE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FILE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={busy}
                  onClick={() => pickRef.current?.click()}
                >
                  <Upload /> 選擇檔案
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera /> 拍照上傳
            </Button>
          </div>
          <input
            ref={pickRef}
            type="file"
            multiple
            hidden
            data-testid="file-input"
            onChange={(e) => upload(e.target.files, kind)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            data-testid="camera-input"
            onChange={(e) => upload(e.target.files, "photo")}
          />
          {busy && <p className="text-sm text-muted-foreground">上傳中…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">單檔上限 50 MB；可上傳圖片、PDF、DWG、DXF。</p>
        </div>

        {FILE_KINDS.map((k) => {
          const group = files.filter((f) => f.kind === k);
          if (group.length === 0) return null;
          return (
            <section key={k} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {FILE_KIND_LABEL[k]}（{group.length}）
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-lg border p-2">
                    <button
                      type="button"
                      onClick={() => download(f)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={`開啟 ${f.fileName}`}
                    >
                      {f.thumbUrl ? (
                        // 簽名網址的縮圖，不經 next/image 最佳化
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.thumbUrl} alt="" className="size-14 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex size-14 shrink-0 items-center justify-center rounded bg-muted">
                          <FileText className="size-6 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{f.fileName}</span>
                        <span className="block text-xs text-muted-foreground">{sizeLabel(f.sizeBytes)}</span>
                      </span>
                    </button>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`刪除 ${f.fileName}`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(f);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {files.length === 0 && <p className="text-sm text-muted-foreground">尚無檔案</p>}
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`確定要刪除「${deleting?.fileName ?? ""}」？`}
        description="刪除後無法復原，並會留下稽核紀錄。"
        confirmLabel="確定刪除"
        pending={pending}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
