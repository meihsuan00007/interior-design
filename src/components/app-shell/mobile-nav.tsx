"use client";

import { FolderKanban, Library, LogOut, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isActive, type ShellProps } from "./nav";
import { OrgSwitcher } from "./org-switcher";

/** 手機頂部列（md 以下顯示）：公司名稱／切換與登出。 */
export function MobileTopBar({ orgName, currentOrgId, orgs }: ShellProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b px-4 py-2 md:hidden">
      <div className="min-w-0 flex-1">
        {orgs.length > 1 ? (
          <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} />
        ) : (
          <p className="truncate text-sm font-medium">{orgName}</p>
        )}
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="sm">
          <LogOut /> 登出
        </Button>
      </form>
    </header>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Plus; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
        active ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

/** 手機底部導覽（固定、含安全區域）。中間的新增案場按鈕只給 admin／designer。 */
export function MobileNav({ canManage }: Pick<ShellProps, "canManage">) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="主選單"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Tab href="/projects" label="案場" icon={FolderKanban} active={isActive(pathname, "/projects") && pathname !== "/projects/new"} />
      {canManage && (
        <Link
          href="/projects/new"
          aria-label="新增案場"
          className="mx-2 -mt-5 mb-2 flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <Plus className="size-7" />
        </Link>
      )}
      {canManage && <Tab href="/master/trades" label="主檔" icon={Library} active={isActive(pathname, "/master")} />}
      <Tab href="/settings/security" label="我的" icon={UserRound} active={isActive(pathname, "/settings")} />
    </nav>
  );
}
