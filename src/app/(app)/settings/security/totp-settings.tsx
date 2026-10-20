"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function TotpSettings({ enabledFactorId }: { enabledFactorId: string | null }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnroll() {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error || !data) {
      setMessage("無法啟用，請稍後再試");
      return;
    }
    setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnroll() {
    if (!enrollment) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code,
    });
    setBusy(false);
    if (error) {
      setMessage("驗證碼錯誤，請重新輸入");
      return;
    }
    setEnrollment(null);
    setCode("");
    router.refresh();
  }

  async function disable() {
    if (!enabledFactorId) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: enabledFactorId });
    setBusy(false);
    if (error) {
      setMessage("停用失敗，請稍後再試");
      return;
    }
    router.refresh();
  }

  if (enabledFactorId) {
    return (
      <section className="space-y-3">
        <h2 className="font-medium">兩步驟驗證（TOTP）：已啟用</h2>
        <Button variant="destructive" onClick={disable} disabled={busy}>
          停用
        </Button>
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">兩步驟驗證（TOTP）：未啟用</h2>
      {!enrollment ? (
        <Button onClick={startEnroll} disabled={busy}>
          啟用
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">請用驗證器 App 掃描 QR Code，再輸入顯示的 6 位數驗證碼。</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt="TOTP QR Code" className="size-48" />
          <p className="text-xs text-muted-foreground">
            無法掃描時，手動輸入金鑰：{enrollment.secret}
          </p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="6 位數驗證碼"
          />
          <Button onClick={confirmEnroll} disabled={busy || code.length !== 6}>
            確認啟用
          </Button>
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </section>
  );
}
