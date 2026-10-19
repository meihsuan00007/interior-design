import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // 已啟用 TOTP 但尚未完成第二步驗證者，不得進入系統
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/mfa");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="font-bold">
            室內設計報價管理系統
          </Link>
          <Link href="/settings/security" className="text-muted-foreground hover:text-foreground">
            安全設定
          </Link>
        </nav>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            登出
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
