import { MfaForm } from "./mfa-form";

export default function MfaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold">兩步驟驗證</h1>
        <p className="text-sm text-muted-foreground">請輸入驗證器 App 顯示的 6 位數驗證碼。</p>
        <MfaForm />
      </div>
    </main>
  );
}
