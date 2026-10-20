import { describe, expect, test } from "vitest";
import { assertAffected, throwDbError, throwRpcError, UserError } from "@/server/db-errors";

function catchError(fn: () => never | void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("throwDbError（資料表操作）", () => {
  test("23505 → 重複；可覆寫", () => {
    expect(catchError(() => throwDbError({ code: "23505" }))).toEqual(new UserError("資料已存在"));
    expect(catchError(() => throwDbError({ code: "23505" }, { duplicate: "名稱已存在" }))).toEqual(
      new UserError("名稱已存在"),
    );
  });

  test("23503 → 仍被使用；可覆寫", () => {
    expect(catchError(() => throwDbError({ code: "23503" }))).toEqual(new UserError("資料仍被使用，無法刪除"));
    expect(catchError(() => throwDbError({ code: "23503" }, { inUse: "此品項已被引用" }))).toEqual(
      new UserError("此品項已被引用"),
    );
  });

  test("42501 → 沒有權限", () => {
    expect(catchError(() => throwDbError({ code: "42501" }))).toEqual(new UserError("沒有權限"));
  });

  test("未知錯誤不外洩原始內容，也不是 UserError", () => {
    const e = catchError(() => throwDbError({ code: "XX000", message: "secret table detail" }));
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(UserError);
    expect((e as Error).message).toBe("資料庫操作失敗（XX000）");
    expect((e as Error).message).not.toContain("secret");
  });
});

describe("throwRpcError（資料庫函式）", () => {
  test("23503 與 P0002 使用函式自己的訊息", () => {
    expect(catchError(() => throwRpcError({ code: "23503", message: "此工種仍有品項" }))).toEqual(
      new UserError("此工種仍有品項"),
    );
    expect(catchError(() => throwRpcError({ code: "P0002", message: "找不到單位" }))).toEqual(
      new UserError("找不到單位"),
    );
  });

  test("23503 與 P0002 可覆寫", () => {
    expect(catchError(() => throwRpcError({ code: "23503", message: "x" }, { inUse: "被使用" }))).toEqual(
      new UserError("被使用"),
    );
    expect(catchError(() => throwRpcError({ code: "P0002", message: "x" }, { notFound: "找不到" }))).toEqual(
      new UserError("找不到"),
    );
  });

  test("22023 使用函式訊息；有 invalid 覆寫時以覆寫為準", () => {
    expect(catchError(() => throwRpcError({ code: "22023", message: "坪數不合法" }))).toEqual(
      new UserError("坪數不合法"),
    );
    expect(catchError(() => throwRpcError({ code: "22023", message: "坪數不合法" }, { invalid: "輸入無效" }))).toEqual(
      new UserError("輸入無效"),
    );
  });

  test("22023 依 HINT 對應（優先於 invalid），不看中文訊息", () => {
    const messages = {
      invalid: "成員設定無效",
      byHint: { last_editor: "至少保留一位", not_org_member: "不屬於本公司" },
    };
    expect(catchError(() => throwRpcError({ code: "22023", message: "任意文字", hint: "last_editor" }, messages))).toEqual(
      new UserError("至少保留一位"),
    );
    expect(
      catchError(() => throwRpcError({ code: "22023", message: "任意文字", hint: "not_org_member" }, messages)),
    ).toEqual(new UserError("不屬於本公司"));
    // 未知 HINT 或沒有 HINT：回到 invalid，不外洩函式訊息
    expect(catchError(() => throwRpcError({ code: "22023", message: "內部細節", hint: "other" }, messages))).toEqual(
      new UserError("成員設定無效"),
    );
    expect(catchError(() => throwRpcError({ code: "22023", message: "內部細節", hint: null }, messages))).toEqual(
      new UserError("成員設定無效"),
    );
  });

  test("42501 → 沒有權限；可覆寫", () => {
    expect(catchError(() => throwRpcError({ code: "42501", message: "權限不足" }))).toEqual(new UserError("沒有權限"));
    expect(catchError(() => throwRpcError({ code: "42501" }, { forbidden: "無權指派" }))).toEqual(
      new UserError("無權指派"),
    );
  });

  test("23505 → 重複；可覆寫", () => {
    expect(catchError(() => throwRpcError({ code: "23505" }))).toEqual(new UserError("資料已存在"));
    expect(catchError(() => throwRpcError({ code: "23505" }, { duplicate: "已存在" }))).toEqual(new UserError("已存在"));
  });

  test("沒有訊息的 23503 退回預設；未知錯誤不外洩", () => {
    expect(catchError(() => throwRpcError({ code: "23503" }))).toEqual(new UserError("資料仍被使用，無法刪除"));
    const e = catchError(() => throwRpcError({ code: "XX000", message: "secret" })) as Error;
    expect(e).not.toBeInstanceOf(UserError);
    expect(e.message).toBe("資料庫操作失敗（XX000）");
  });
});

describe("assertAffected", () => {
  test("沒有命中列就丟 UserError", () => {
    expect(() => assertAffected(null)).toThrow(UserError);
    expect(() => assertAffected([])).toThrow("找不到資料，或沒有權限");
    expect(() => assertAffected([{ id: 1 }])).not.toThrow();
  });
});
