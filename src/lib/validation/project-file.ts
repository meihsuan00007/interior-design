import { z } from "zod";
import { FILE_KINDS } from "@/lib/project-files";

/**
 * 登錄案場檔案的輸入。fileName 上限寬鬆：實際截斷由 recordProjectFile 的 safeFileName 負責，
 * 避免長檔名被這裡退件而在 Storage 留下孤兒物件。
 */
export const recordFileSchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(FILE_KINDS),
  storagePath: z.string().min(1).max(600),
  fileName: z.string().min(1).max(1000),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(52428800),
});
