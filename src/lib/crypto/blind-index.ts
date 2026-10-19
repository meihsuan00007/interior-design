import { createHmac } from "node:crypto";
import { getServerEnv } from "@/lib/env";

// 盲索引：加密欄位的精確比對用 HMAC-SHA256（hex）。僅限伺服器端使用。

export type BlindIndexKind = "phone" | "email" | "national_id";

function normalize(kind: BlindIndexKind, value: string): string {
  switch (kind) {
    case "phone":
      return value.replace(/\D/g, "");
    case "email":
      return value.trim().toLowerCase();
    case "national_id":
      return value.trim().toUpperCase();
  }
}

export function blindIndex(
  kind: BlindIndexKind,
  value: string,
  key?: Buffer,
): string {
  const k = key ?? Buffer.from(getServerEnv().BLIND_INDEX_KEY, "base64");
  return createHmac("sha256", k)
    .update(`${kind}:${normalize(kind, value)}`)
    .digest("hex");
}
