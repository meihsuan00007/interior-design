import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const CURRENT_ORG_COOKIE = "current_org";

export class ForbiddenError extends Error {
  constructor(message = "沒有權限執行此操作") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: Role;
  canViewCost: boolean;
  canViewUnitPrice: boolean;
}

export interface AppContext {
  userId: string;
  memberships: Membership[];
}

interface MembershipRow {
  organization_id: string;
  role: Role;
  can_view_cost: boolean;
  can_view_unit_price: boolean;
  organizations: { name: string } | { name: string }[] | null;
}

/** 可注入 Supabase client 的核心；未登入回傳 null。 */
export async function loadAppContext(supabase: SupabaseClient): Promise<AppContext | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role, can_view_cost, can_view_unit_price, organizations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`讀取所屬公司失敗：${error.message}`);

  const rows = (data ?? []) as unknown as MembershipRow[];
  return {
    userId: user.id,
    memberships: rows.map((r) => {
      const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
      return {
        organizationId: r.organization_id,
        organizationName: org?.name ?? "",
        role: r.role,
        canViewCost: r.can_view_cost,
        canViewUnitPrice: r.can_view_unit_price,
      };
    }),
  };
}

/** 取得目前登入者的情境；未登入時導向 /login。 */
export async function getAppContext(): Promise<AppContext> {
  const ctx = await loadAppContext(await createClient());
  if (!ctx) redirect("/login");
  return ctx;
}

/** 目前公司：cookie 值若為自己的 membership 則用之，否則第一家。 */
export function getCurrentOrg(ctx: AppContext, cookieValue?: string): Membership {
  const first = ctx.memberships[0];
  if (!first) throw new ForbiddenError("尚未加入任何公司");
  return ctx.memberships.find((m) => m.organizationId === cookieValue) ?? first;
}

/** 讀取 current_org cookie 後呼叫 getCurrentOrg。 */
export async function getCurrentOrgFromCookie(ctx: AppContext): Promise<Membership> {
  const store = await cookies();
  return getCurrentOrg(ctx, store.get(CURRENT_ORG_COOKIE)?.value);
}

export function requireOrgRole(ctx: AppContext, orgId: string, roles: Role[]): void {
  const m = ctx.memberships.find((x) => x.organizationId === orgId);
  if (!m || !roles.includes(m.role)) throw new ForbiddenError();
}
