"use client";

import { FolderKanban, Library, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "./org-switcher";

export interface ShellProps {
  orgName: string;
  currentOrgId: string;
  /** 只有屬於多家公司時才有值 */
  orgs: { id: string; name: string }[];
  /** admin／designer 才能看到主檔與新增案場 */
  canManage: boolean;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 桌機左側導覽（md 以上顯示）。 */
export function DesktopNav({ orgName, currentOrgId, orgs, canManage }: ShellProps) {
  const pathname = usePathname();
  const items = [
    { href: "/projects", match: "/projects", label: "案場", icon: FolderKanban, show: true },
    { href: "/master/trades", match: "/master", label: "主檔", icon: Library, show: canManage },
    { href: "/settings/security", match: "/settings", label: "安全設定", icon: ShieldCheck, show: true },
  ].filter((i) => i.show);

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-6 border-r bg-card px-4 py-6 md:flex">
      <div className="space-y-3">
        <Link href="/projects" className="block text-sm font-bold leading-tight">
          室內設計報價管理系統
        </Link>
        {orgs.length > 1 ? (
          <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} />
        ) : (
          <p className="truncate text-xs text-muted-foreground">{orgName}</p>
        )}
      </div>
      <nav aria-label="主選單" className="flex flex-1 flex-col gap-1 text-sm">
        {items.map(({ href, match, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, match) ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted",
              isActive(pathname, match) ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          <LogOut /> 登出
        </Button>
      </form>
    </aside>
  );
}
