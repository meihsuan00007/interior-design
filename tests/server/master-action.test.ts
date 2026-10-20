import { beforeEach, describe, expect, test, vi } from "vitest";

const ORG_FROM_COOKIE = "10000000-0000-4000-8000-0000000000aa";
const ORG_FROM_FORM = "10000000-0000-4000-8000-0000000000bb";

const state = vi.hoisted(() => ({ role: "designer" as "admin" | "designer" | "supervisor" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/context")>();
  return {
    ...actual,
    getAppContext: vi.fn(async () => ({
      userId: "u1",
      memberships: [
        {
          organizationId: ORG_FROM_COOKIE,
          organizationName: "甲",
          role: state.role,
          canViewCost: false,
          canViewUnitPrice: false,
        },
      ],
    })),
    getCurrentOrgFromCookie: vi.fn(async () => ({
      organizationId: ORG_FROM_COOKIE,
      organizationName: "甲",
      role: state.role,
      canViewCost: false,
      canViewUnitPrice: false,
    })),
  };
});
vi.mock("@/server/master/trades", () => ({
  createTrade: vi.fn(async () => ({})),
  updateTrade: vi.fn(),
  deleteTrade: vi.fn(),
  moveTrade: vi.fn(),
}));

import { UserError } from "@/server/db-errors";
import { formBool, formInt, formNullable, formString, runMasterWrite } from "@/server/master/action";
import { saveTradeAction } from "@/app/(app)/master/trades/actions";
import { createTrade } from "@/server/master/trades";

beforeEach(() => {
  state.role = "designer";
  vi.clearAllMocks();
});

describe("runMasterWrite", () => {
  test("公司 id 來自 cookie 解析的 membership", async () => {
    const fn = vi.fn(async () => {});
    const r = await runMasterWrite("/x", fn);
    expect(r).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledWith(ORG_FROM_COOKIE);
  });

  test("supervisor 回「沒有權限」且不執行", async () => {
    state.role = "supervisor";
    const fn = vi.fn(async () => {});
    expect(await runMasterWrite("/x", fn)).toEqual({ ok: false, message: "沒有權限" });
    expect(fn).not.toHaveBeenCalled();
  });

  test("fn 內拋 ForbiddenError 也轉成「沒有權限」", async () => {
    const { ForbiddenError } = await import("@/server/context");
    const r = await runMasterWrite("/x", async () => {
      throw new ForbiddenError();
    });
    expect(r).toEqual({ ok: false, message: "沒有權限" });
  });

  test("UserError 保留訊息與欄位錯誤", async () => {
    const r = await runMasterWrite("/x", async () => {
      throw new UserError("名稱已存在", { name: "重複" });
    });
    expect(r).toEqual({ ok: false, message: "名稱已存在", fieldErrors: { name: "重複" } });
  });

  test("未知錯誤只回通用訊息，不洩漏原始內容", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runMasterWrite("/x", async () => {
      throw new Error("password=hunter2 relation foo");
    });
    expect(r).toEqual({ ok: false, message: "操作失敗，請稍後再試" });
    expect(JSON.stringify(r)).not.toContain("hunter2");
    spy.mockRestore();
  });
});

describe("saveTradeAction", () => {
  test("忽略表單裡的 organization_id，使用 cookie 的公司", async () => {
    const fd = new FormData();
    fd.set("name", "水電");
    fd.set("sort", "10");
    fd.set("defaultIncludeInMgmtFee", "on");
    fd.set("organization_id", ORG_FROM_FORM);
    const r = await saveTradeAction(null, fd);
    expect(r).toEqual({ ok: true });
    expect(createTrade).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createTrade).mock.calls[0][0]).toBe(ORG_FROM_COOKIE);
  });

  test("驗證失敗回 fieldErrors，且不呼叫 server 模組", async () => {
    const fd = new FormData();
    fd.set("name", "");
    fd.set("sort", "abc");
    const r = await saveTradeAction(null, fd);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors?.name).toBeDefined();
      expect(r.fieldErrors?.sort).toBeDefined();
    }
    expect(createTrade).not.toHaveBeenCalled();
  });
});

describe("form helpers", () => {
  const fd = new FormData();
  fd.set("a", "on");
  fd.set("b", "true");
  fd.set("c", "off");
  fd.set("e", "");
  fd.set("n1", " 12 ");
  fd.set("n2", "1.5");
  fd.set("n3", "x");
  fd.set("n4", "");

  test("formString：缺少欄位回空字串", () => {
    expect(formString(fd, "zzz")).toBe("");
    expect(formString(fd, "a")).toBe("on");
  });
  test("formBool：on／true 為真，其餘為假", () => {
    expect(formBool(fd, "a")).toBe(true);
    expect(formBool(fd, "b")).toBe(true);
    expect(formBool(fd, "c")).toBe(false);
    expect(formBool(fd, "zzz")).toBe(false);
  });
  test("formNullable：空字串與缺少為 null", () => {
    expect(formNullable(fd, "e")).toBeNull();
    expect(formNullable(fd, "zzz")).toBeNull();
    expect(formNullable(fd, "a")).toBe("on");
  });
  test("formInt：整數、空白為 0、其餘 NaN", () => {
    expect(formInt(fd, "n1")).toBe(12);
    expect(formInt(fd, "n4")).toBe(0);
    expect(formInt(fd, "zzz")).toBe(0);
    expect(formInt(fd, "n2")).toBeNaN();
    expect(formInt(fd, "n3")).toBeNaN();
  });
});
