import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";

// 欄位級 AES-256-GCM 加密。僅限伺服器端使用（未安裝 server-only 套件）。
// 格式：v1:<iv base64>:<authTag base64>:<ciphertext base64>

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function resolveKey(key?: Buffer): Buffer {
  const resolved = key ?? Buffer.from(getServerEnv().FIELD_ENCRYPTION_KEY, "base64");
  if (resolved.length !== KEY_BYTES) {
    throw new Error("欄位加密金鑰長度必須為 32 bytes");
  }
  return resolved;
}

export function encryptField(plaintext: string, key?: Buffer): string {
  const k = resolveKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptField(payload: string, key?: Buffer): string {
  const k = resolveKey(key);
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("加密欄位格式錯誤");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("加密欄位格式錯誤");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("解密失敗：資料遭竄改或金鑰不符");
  }
}
