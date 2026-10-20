"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "./use-is-desktop";

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** 新增／編輯用側欄：桌機由右側滑出，手機由下方滑出。 */
export function FormSheet({ open, onOpenChange, title, description, children }: FormSheetProps) {
  const isDesktop = useIsDesktop();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className="max-h-[92vh] overflow-y-auto md:max-h-none md:w-[28rem] md:max-w-[28rem]"
      >
        <SheetHeader className="px-6 pt-6">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription>{description ?? "填寫後按「儲存」。"}</SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
