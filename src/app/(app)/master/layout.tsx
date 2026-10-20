import { MasterTabs } from "./_components/tabs";

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 md:px-6">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">主檔管理</h1>
          <p className="text-sm text-muted-foreground">維護工種、單位、品項與廠商，供報價時帶入。</p>
        </div>
        <MasterTabs />
      </header>
      {children}
    </main>
  );
}
