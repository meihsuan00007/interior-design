import { describe, expect, test, vi } from "vitest";
import { ForbiddenError, getCurrentOrg, loadAppContext, requireOrgRole, type AppContext } from "@/server/context";

const m = (id: string, role: "admin" | "designer" | "supervisor" = "designer") => ({
  organizationId: id,
  organizationName: id,
  role,
  canViewCost: false,
  canViewUnitPrice: false,
});

describe("getCurrentOrg", () => {
  const ctx: AppContext = { userId: "u", memberships: [m("a"), m("b")] };
  test("cookie 符合時採用", () => {
    expect(getCurrentOrg(ctx, "b").organizationId).toBe("b");
  });
  test("cookie 不屬於自己或未設定時用第一家", () => {
    expect(getCurrentOrg(ctx, "zzz").organizationId).toBe("a");
    expect(getCurrentOrg(ctx).organizationId).toBe("a");
  });
  test("沒有任何公司時拋 ForbiddenError", () => {
    expect(() => getCurrentOrg({ userId: "u", memberships: [] })).toThrow(ForbiddenError);
    expect(() => getCurrentOrg({ userId: "u", memberships: [] })).toThrow("尚未加入任何公司");
  });
});

describe("requireOrgRole", () => {
  const ctx: AppContext = { userId: "u", memberships: [m("a", "designer")] };
  test("角色符合通過，否則拋錯", () => {
    expect(() => requireOrgRole(ctx, "a", ["designer"])).not.toThrow();
    expect(() => requireOrgRole(ctx, "a", ["admin"])).toThrow(ForbiddenError);
    expect(() => requireOrgRole(ctx, "other", ["designer"])).toThrow(ForbiddenError);
  });
});

describe("loadAppContext", () => {
  test("沒有登入使用者時回傳 null，且不查詢 memberships", async () => {
    const from = vi.fn();
    const supabase = {
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from,
    };
    expect(await loadAppContext(supabase as never)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
