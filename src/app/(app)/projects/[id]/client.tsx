"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clearContactAction, revealContactAction } from "./actions";
import { ConfirmDialog } from "./confirm";

type Field = "phone" | "email" | "national_id";
interface Contact {
  phone: string | null;
  email: string | null;
  national_id: string | null;
}

/** 身分證字號預設遮罩：保留首碼與末三碼 */
function maskNationalId(v: string): string {
  return v.length <= 4 ? "*".repeat(v.length) : `${v.slice(0, 1)}${"*".repeat(v.length - 4)}${v.slice(-3)}`;
}

const LABEL: Record<Field, string> = { phone: "電話", email: "Email", national_id: "身分證字號" };

function Row({
  label,
  present,
  onClear,
  children,
}: {
  label: string;
  present: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {present ? (
          <div className="break-all text-sm">{children}</div>
        ) : (
          <p className="text-sm text-muted-foreground">未填寫</p>
        )}
      </div>
      {present && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          清除
        </Button>
      )}
    </div>
  );
}

export function ClientCard({ projectId, name }: { projectId: string; name: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [showId, setShowId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [clearing, setClearing] = useState<Field | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  function reveal() {
    setError(null);
    startTransition(async () => {
      const r = await revealContactAction(projectId);
      if (!r.ok) return setError(r.message);
      setContact({ phone: r.phone, email: r.email, national_id: r.nationalId });
    });
  }

  function askClear(field: Field) {
    setClearError(null);
    setClearing(field);
  }

  function confirmClear() {
    if (!clearing) return;
    const field = clearing;
    setClearError(null);
    startTransition(async () => {
      const r = await clearContactAction(projectId, field);
      if (!r.ok) return setClearError(r.message);
      setContact((c) => (c ? { ...c, [field]: null } : c));
      setClearing(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>業主</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-base font-medium">{name || "（無法讀取姓名）"}</p>
        {contact ? (
          <div>
            <Row label={LABEL.phone} present={!!contact.phone} onClear={() => askClear("phone")}>
              <a href={`tel:${contact.phone ?? ""}`} className="text-primary hover:underline">
                {contact.phone}
              </a>
            </Row>
            <Row label={LABEL.email} present={!!contact.email} onClear={() => askClear("email")}>
              {contact.email}
            </Row>
            <Row label={LABEL.national_id} present={!!contact.national_id} onClear={() => askClear("national_id")}>
              <span className="inline-flex items-center gap-2">
                <span className="font-mono">
                  {showId ? contact.national_id : maskNationalId(contact.national_id ?? "")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showId ? "隱藏身分證字號" : "顯示身分證字號"}
                  onClick={() => setShowId((v) => !v)}
                >
                  {showId ? <EyeOff /> : <Eye />}
                </Button>
              </span>
            </Row>
          </div>
        ) : (
          <div className="space-y-2">
            <Button type="button" variant="outline" onClick={reveal} disabled={pending} className="h-10">
              {pending ? "讀取中…" : "顯示聯絡資料"}
            </Button>
            <p className="text-xs text-muted-foreground">顯示聯絡資料會留下稽核紀錄。</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={clearing !== null}
        onOpenChange={(o) => !o && setClearing(null)}
        title={`確定要清除${clearing ? LABEL[clearing] : ""}？`}
        description="清除後無法復原。"
        confirmLabel="確定清除"
        pending={pending}
        error={clearError}
        onConfirm={confirmClear}
      />
    </Card>
  );
}
