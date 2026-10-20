import { createHmac } from "node:crypto";
import { getServerEnv } from "@/lib/env";

// 盲索引：加密欄位的精確比對用 HMAC-SHA256（hex）。僅限伺服器端使用。

export type BlindIndexKind = "phone" | "email" | "national_id" | "name";

function normalize(kind: BlindIndexKind, value: string): string {
  switch (kind) {
    case "phone":
      return value.replace(/\D/g, "");
    case "email":
      return value.trim().toLowerCase();
    case "national_id":
      return value.trim().toUpperCase();
    case "name":
      // 前後空白去除、內部連續空白合併為一個；保留大小寫（中文姓名無大小寫）
      return value.trim().replace(/\s+/g, " ");
  }
}

export function blindIndex(
  kind: BlindIndexKind,
  value: string,
  key?: Buffer,
): string {
  const normalized = normalize(kind, value);
  if (normalized === "") {
    throw new Error("盲索引的值不可為空；可能為空值時請改用 blindIndexOrNull");
  }
  const k = key ?? Buffer.from(getServerEnv().BLIND_INDEX_KEY, "base64");
  return createHmac("sha256", k).update(`${kind}:${normalized}`).digest("hex");
}

/** 正規化後為空字串（含 null / undefined）時回傳 null，其餘同 blindIndex。 */
export function blindIndexOrNull(
  kind: BlindIndexKind,
  value: string | null | undefined,
  key?: Buffer,
): string | null {
  if (value == null || normalize(kind, value) === "") return null;
  return blindIndex(kind, value, key);
}
