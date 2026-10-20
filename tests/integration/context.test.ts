import { describe, expect, test } from "vitest";
import { loadAppContext } from "@/server/context";
import { signInAs } from "./helpers";

describe("loadAppContext（本機 Supabase）", () => {
  test("designer@jia.example 屬於甲公司，角色 designer", async () => {
    const ctx = await loadAppContext(await signInAs("designer@jia.example"));
    expect(ctx).not.toBeNull();
    expect(ctx!.memberships).toHaveLength(1);
    expect(ctx!.memberships[0].role).toBe("designer");
    expect(ctx!.memberships[0].organizationName).not.toBe("");
  });

  test("乙公司管理員與甲公司管理員的公司不同", async () => {
    const jia = await loadAppContext(await signInAs("admin@jia.example"));
    const yi = await loadAppContext(await signInAs("admin@yi.example"));
    expect(yi!.memberships[0].organizationId).not.toBe(jia!.memberships[0].organizationId);
  });
});
