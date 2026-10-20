"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/** 搜尋框：停止輸入 300ms 後把 q 寫入網址（保留其他查詢參數），由伺服器端重新查詢。 */
export function ProjectSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);
  const current = searchParams.toString();

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(current);
      const q = value.trim();
      if (q) next.set("q", q);
      else next.delete("q");
      const qs = next.toString();
      if (qs !== current) router.replace(qs ? `/projects?${qs}` : "/projects");
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, current, router]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="搜尋案名或行政區"
        placeholder="搜尋案名或行政區"
        maxLength={50}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-10 pl-9"
      />
    </div>
  );
}
