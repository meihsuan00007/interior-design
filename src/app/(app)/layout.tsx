import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getAppContext, getCurrentOrgFromCookie } from "@/server/context";
import { logoutAction } from "../(auth)/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // 已啟用 TOTP 但尚未完成第二步驗證者，不得進入系統
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/mfa");

  const ctx = await getAppContext();
  const org = ctx.memberships.length > 0 ? await getCurrentOrgFromCookie(ctx) : null;

  if (!org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">您尚未加入任何公司，請聯絡管理者</p>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            登出
          </Button>
        </form>
      </div>
    );
  }

  return (
    <AppShell
      orgName={org.organizationName}
      currentOrgId={org.organizationId}
      orgs={
        ctx.memberships.length > 1
          ? ctx.memberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))
          : []
      }
      canManage={org.role === "admin" || org.role === "designer"}
    >
      {children}
    </AppShell>
  );
}
