"use client";

import { useTransition } from "react";
import { switchOrgAction } from "@/app/(app)/org-actions";

/** 多公司使用者才會看到；切換後由伺服器動作寫入 current_org cookie 並重新整理。 */
export function OrgSwitcher({
  orgs,
  currentOrgId,
}: {
  orgs: { id: string; name: string }[];
  currentOrgId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="block space-y-1">
      <span className="sr-only">切換公司</span>
      <select
        aria-label="切換公司"
        value={currentOrgId}
        disabled={pending}
        onChange={(e) => startTransition(() => switchOrgAction(e.target.value))}
        className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
