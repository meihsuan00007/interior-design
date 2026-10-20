import { createClient } from "@/lib/supabase/server";
import { TotpSettings } from "./totp-settings";

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp.find((f) => f.status === "verified");
  return (
    <main className="max-w-md space-y-6 p-8">
      <h1 className="text-2xl font-bold">安全設定</h1>
      <TotpSettings enabledFactorId={verified?.id ?? null} />
    </main>
  );
}
