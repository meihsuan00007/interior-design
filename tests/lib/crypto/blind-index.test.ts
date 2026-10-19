import { describe, expect, test } from "vitest";
import { blindIndex } from "@/lib/crypto/blind-index";

const key = Buffer.alloc(32, 7);

describe("盲索引", () => {
  test("電話格式不同但號碼相同時結果相同", () => {
    expect(blindIndex("phone", "0912-345-678", key)).toBe(
      blindIndex("phone", "0912345678", key),
    );
  });

  test("email 去空白並轉小寫", () => {
    expect(blindIndex("email", " A@Example.com ", key)).toBe(
      blindIndex("email", "a@example.com", key),
    );
  });

  test("身分證字號去空白並轉大寫", () => {
    expect(blindIndex("national_id", " a123456789 ", key)).toBe(
      blindIndex("national_id", "A123456789", key),
    );
  });

  test("輸出為 64 字元 hex", () => {
    expect(blindIndex("phone", "0912345678", key)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("不同金鑰結果不同", () => {
    expect(blindIndex("phone", "0912345678", key)).not.toBe(
      blindIndex("phone", "0912345678", Buffer.alloc(32, 9)),
    );
  });

  test("相同字串在不同 kind 下結果不同", () => {
    expect(blindIndex("phone", "123456", key)).not.toBe(
      blindIndex("national_id", "123456", key),
    );
  });
});
