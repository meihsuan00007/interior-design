import { createClient } from "@/lib/supabase/server";

const ROLE_LABEL: Record<string, string> = {
  admin: "管理員",
  designer: "設計師",
  supervisor: "監工",
};

export default async function HomePage() {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations(name)")
    .order("created_at");

  return (
    <main className="space-y-4 p-8">
      <h1 className="text-3xl font-bold">室內設計報價管理系統</h1>
      <ul className="text-sm text-muted-foreground">
        {(memberships ?? []).map((m, i) => {
          const org = m.organizations as unknown as { name: string } | null;
          return (
            <li key={i}>
              {org?.name ?? "—"}：{ROLE_LABEL[m.role as string] ?? m.role}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
