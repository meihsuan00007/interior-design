import { beforeEach, describe, expect, test, vi } from "vitest";

const { MINE_A, MINE_B, OTHERS } = vi.hoisted(() => ({
  MINE_A: "10000000-0000-4000-8000-0000000000a1",
  MINE_B: "10000000-0000-4000-8000-0000000000b2",
  OTHERS: "10000000-0000-4000-8000-0000000000c3",
}));

const { set, revalidatePath } = vi.hoisted(() => ({ set: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set })) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/context")>();
  return {
    ...actual,
    getAppContext: vi.fn(async () => ({
      userId: "u1",
      memberships: [MINE_A, MINE_B].map((organizationId) => ({
        organizationId,
        organizationName: "x",
        role: "designer",
        canViewCost: false,
        canViewUnitPrice: false,
      })),
    })),
  };
});

import { switchOrgAction } from "@/app/(app)/org-actions";

beforeEach(() => vi.clearAllMocks());

describe("switchOrgAction", () => {
  test("自己的公司：寫入 httpOnly current_org cookie 並重新整理", async () => {
    await switchOrgAction(MINE_B);
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = set.mock.calls[0];
    expect(name).toBe("current_org");
    expect(value).toBe(MINE_B);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  test("不是自己 membership 的公司：不寫 cookie", async () => {
    await switchOrgAction(OTHERS);
    expect(set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("亂填的值：不寫 cookie", async () => {
    await switchOrgAction("");
    await switchOrgAction(undefined as unknown as string);
    expect(set).not.toHaveBeenCalled();
  });
});
