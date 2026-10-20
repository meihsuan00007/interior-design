"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { CURRENT_ORG_COOKIE, getAppContext } from "@/server/context";

/**
 * 切換目前公司：只接受自己 membership 內的公司，值寫入 httpOnly 的 current_org cookie。
 * 不是自己的公司時什麼都不做（不洩漏該公司是否存在）。
 */
export async function switchOrgAction(orgId: string): Promise<void> {
  const ctx = await getAppContext();
  if (typeof orgId !== "string" || !ctx.memberships.some((m) => m.organizationId === orgId)) return;
  const store = await cookies();
  store.set(CURRENT_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
