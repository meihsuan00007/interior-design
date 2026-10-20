"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { href: "/master/trades", label: "工種" },
  { href: "/master/units", label: "單位" },
  { href: "/master/catalog", label: "品項" },
  { href: "/master/vendors", label: "廠商" },
] as const;

export function MasterTabs() {
  const pathname = usePathname();
  const current = TABS.find((t) => pathname.startsWith(t.href))?.href ?? "";
  return (
    <Tabs value={current}>
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t.href} value={t.href} asChild>
            <Link href={t.href}>{t.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
