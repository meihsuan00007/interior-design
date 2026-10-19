import { describe, expect, test } from "vitest";
import { parseServerEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  BLIND_INDEX_KEY: Buffer.alloc(32, 2).toString("base64"),
};

describe("parseServerEnv", () => {
  test("缺少 FIELD_ENCRYPTION_KEY 時拋錯，錯誤訊息包含變數名稱", () => {
    const { FIELD_ENCRYPTION_KEY: _omit, ...rest } = valid;
    void _omit;
    expect(() => parseServerEnv(rest)).toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  test("FIELD_ENCRYPTION_KEY 解碼後不是 32 bytes 時拋錯", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
      }),
    ).toThrow(/32/);
  });

  test("BLIND_INDEX_KEY 解碼後少於 32 bytes 時拋錯", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        BLIND_INDEX_KEY: Buffer.alloc(16).toString("base64"),
      }),
    ).toThrow(/BLIND_INDEX_KEY/);
  });

  test("SESSION_IDLE_MINUTES 未設定時預設 120（閒置 2 小時）", () => {
    expect(parseServerEnv(valid).SESSION_IDLE_MINUTES).toBe(120);
  });

  test("SESSION_IDLE_MINUTES 可由環境變數字串覆寫", () => {
    expect(
      parseServerEnv({ ...valid, SESSION_IDLE_MINUTES: "30" })
        .SESSION_IDLE_MINUTES,
    ).toBe(30);
  });

  test("非 base64 字串被拒絕", () => {
    expect(() =>
      parseServerEnv({ ...valid, FIELD_ENCRYPTION_KEY: "not base64!!" }),
    ).toThrow(/base64/);
    expect(() =>
      parseServerEnv({ ...valid, BLIND_INDEX_KEY: "***" }),
    ).toThrow(/BLIND_INDEX_KEY/);
  });

  test("BLIND_INDEX_KEY 剛好 32 bytes 可接受", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        BLIND_INDEX_KEY: Buffer.alloc(32, 3).toString("base64"),
      }),
    ).not.toThrow();
  });

  test("FIELD_ENCRYPTION_KEY 為 33 bytes 時拒絕", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        FIELD_ENCRYPTION_KEY: Buffer.alloc(33, 1).toString("base64"),
      }),
    ).toThrow(/32/);
  });
});
