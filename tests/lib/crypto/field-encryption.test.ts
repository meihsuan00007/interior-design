import { describe, expect, test } from "vitest";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";

const key = Buffer.alloc(32, 7);

describe("欄位加密", () => {
  test("中文往返加解密", () => {
    const text = "台北市大安區某路一段1號5樓";
    expect(decryptField(encryptField(text, key), key)).toBe(text);
  });

  test("空字串也能往返", () => {
    expect(decryptField(encryptField("", key), key)).toBe("");
  });

  test("輸出格式為 v1:iv:tag:ciphertext，iv 為 12 bytes", () => {
    const parts = encryptField("0912345678", key).split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    expect(Buffer.from(parts[1], "base64")).toHaveLength(12);
  });

  test("同一明文兩次加密結果不同（隨機 IV）", () => {
    expect(encryptField("0912345678", key)).not.toBe(
      encryptField("0912345678", key),
    );
  });

  test("竄改密文或用錯金鑰時拋錯", () => {
    const p = encryptField("secret", key).split(":");
    p[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptField(p.join(":"), key)).toThrow();
    expect(() =>
      decryptField(encryptField("secret", key), Buffer.alloc(32, 8)),
    ).toThrow();
  });

  test("版本前綴、段數、IV 長度不符時拋錯", () => {
    const p = encryptField("secret", key).split(":");
    expect(() => decryptField(["v2", ...p.slice(1)].join(":"), key)).toThrow();
    expect(() => decryptField(p.slice(0, 3).join(":"), key)).toThrow();
    expect(() => decryptField([...p, "x"].join(":"), key)).toThrow();
    const badIv = [p[0], Buffer.alloc(8).toString("base64"), p[2], p[3]];
    expect(() => decryptField(badIv.join(":"), key)).toThrow();
  });

  test("金鑰不是 32 bytes 時拋錯", () => {
    expect(() => encryptField("x", Buffer.alloc(16))).toThrow();
    expect(() => decryptField("v1:a:b:c", Buffer.alloc(33))).toThrow();
  });

  test("錯誤訊息不含明文或金鑰", () => {
    const secret = "絕密明文-A1B2C3";
    const p = encryptField(secret, key).split(":");
    p[3] = Buffer.from("tampered").toString("base64");
    try {
      decryptField(p.join(":"), key);
      throw new Error("應該拋錯");
    } catch (e) {
      const msg = String((e as Error).message);
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain(key.toString("base64"));
      expect(msg).not.toContain(key.toString("hex"));
    }
  });
});
