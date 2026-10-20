"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setMemberAction } from "./actions";

export interface MemberView {
  userId: string;
  /** email 前綴 */
  label: string;
  role: "admin" | "designer" | "supervisor";
}

const ROLE_LABEL = { admin: "管理者", designer: "設計師", supervisor: "監工" } as const;

export function MembersCard({
  projectId,
  members,
  addable,
  canManage,
}: {
  projectId: string;
  members: MemberView[];
  addable: MemberView[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(userId: string, add: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setMemberAction(projectId, userId, add);
      if (!r.ok) return setError(r.message);
      setSelected("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>成員</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">{m.label}</span>
                <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
              </span>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`移除 ${m.label}`}
                  disabled={pending}
                  onClick={() => run(m.userId, false)}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
          {members.length === 0 && <li className="py-2 text-sm text-muted-foreground">尚無成員</li>}
        </ul>

        {canManage && (
          <div className="flex gap-2">
            <select
              aria-label="選擇要加入的成員"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
            >
              <option value="">選擇要加入的成員</option>
              {addable.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}（{ROLE_LABEL[m.role]}）
                </option>
              ))}
            </select>
            <Button
              type="button"
              className="h-10"
              disabled={pending || selected === ""}
              onClick={() => run(selected, true)}
            >
              加入
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
