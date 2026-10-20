import { DesktopNav, type ShellProps } from "./nav";
import { MobileNav, MobileTopBar } from "./mobile-nav";

/** 應用程式外框：桌機左側導覽、手機頂部列與底部導覽。 */
export function AppShell({ children, ...props }: ShellProps & { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <DesktopNav {...props} />
      <div className="min-w-0 flex-1 pb-24 md:pb-0">
        <MobileTopBar {...props} />
        {children}
      </div>
      <MobileNav canManage={props.canManage} />
    </div>
  );
}
