"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/**
 * 搜尋框：使用者停止輸入 300ms 後把 q 寫入網址（保留其他查詢參數）。
 * 只有使用者打字才會寫網址；網址變動（上一頁、點 chip）時輸入框反過來跟著網址，不會被舊值蓋回去。
 */
export function ProjectSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const typed = useRef(false);

  // 網址的 q 改變（且不是使用者正在輸入）→ 輸入框同步
  useEffect(() => {
    if (!typed.current) setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const q = value.trim();
      if (q) next.set("q", q);
      else next.delete("q");
      typed.current = false;
      const qs = next.toString();
      if (qs !== searchParams.toString()) router.replace(qs ? `/projects?${qs}` : "/projects");
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, searchParams, router]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="搜尋案名或行政區"
        placeholder="搜尋案名或行政區"
        maxLength={50}
        value={value}
        onChange={(e) => {
          typed.current = true;
          setValue(e.target.value);
        }}
        className="h-10 pl-9"
      />
    </div>
  );
}
