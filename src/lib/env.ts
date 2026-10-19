import { z } from "zod";
import { DEFAULT_IDLE_MINUTES, MAX_IDLE_MINUTES } from "@/lib/auth/idle";

/** 檢查 base64 字串解碼後的 byte 數 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function base64Bytes(value: string): number {
  return Buffer.from(value, "base64").length;
}

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "必填"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "必填"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "必填"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "必填"),
  // AES-256-GCM 欄位加密金鑰：base64，解碼後必須剛好 32 bytes
  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(1, "必填")
    .regex(BASE64_PATTERN, "不是有效的 base64 字串")
    .refine((v) => base64Bytes(v) === 32, "base64 解碼後必須為 32 bytes"),
  // 盲索引（HMAC）金鑰：base64，解碼後至少 32 bytes
  BLIND_INDEX_KEY: z
    .string()
    .min(1, "必填")
    .regex(BASE64_PATTERN, "不是有效的 base64 字串")
    .refine((v) => base64Bytes(v) >= 32, "base64 解碼後至少需要 32 bytes"),
  // 閒置自動登出分鐘數，預設 120（2 小時）
  SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_IDLE_MINUTES, `不可超過 ${MAX_IDLE_MINUTES} 分鐘（7 天）`)
    .default(DEFAULT_IDLE_MINUTES),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** 驗證環境變數；失敗時拋錯，訊息列出每個有問題的變數名稱。 */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new Error(`環境變數設定有誤：\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** 以 process.env 取得已驗證的環境變數（結果會快取）。僅限伺服器端使用。 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
