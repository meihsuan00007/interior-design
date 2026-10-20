import { describe, expect, test } from "vitest";
import { blindIndex, blindIndexOrNull } from "@/lib/crypto/blind-index";

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

describe("盲索引：空值與姓名", () => {
  test("blindIndexOrNull 正規化後為空時回傳 null", () => {
    expect(blindIndexOrNull("phone", "-", key)).toBeNull();
    expect(blindIndexOrNull("email", "   ", key)).toBeNull();
    expect(blindIndexOrNull("phone", null, key)).toBeNull();
    expect(blindIndexOrNull("phone", undefined, key)).toBeNull();
  });

  test("blindIndexOrNull 有值時等同 blindIndex", () => {
    expect(blindIndexOrNull("phone", " 0912-345-678 ", key)).toBe(
      blindIndex("phone", "0912345678", key),
    );
  });

  test("blindIndex 空值拋錯", () => {
    expect(() => blindIndex("phone", "", key)).toThrow();
    expect(() => blindIndex("name", "  ", key)).toThrow();
  });

  test("姓名：前後空白忽略，內部空白保留為一個", () => {
    expect(blindIndex("name", "王小明", key)).toBe(blindIndex("name", " 王小明 ", key));
    expect(blindIndex("name", "王 小明", key)).not.toBe(blindIndex("name", "王小明 ", key));
    expect(blindIndex("name", "王   小明", key)).toBe(blindIndex("name", "王 小明", key));
  });
});
