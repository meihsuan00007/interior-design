import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUS_LABEL } from "@/db/schema/projects";
import { getAppContext, getCurrentOrgFromCookie } from "@/server/context";
import { emailPrefix, getProjectDetail } from "@/server/projects/detail";
import { createSignedThumbUrls, listProjectFiles } from "@/server/projects/files";
import { StatusBadge } from "../status-badge";
import { ClientCard } from "./client";
import { FilesCard, type FileView } from "./files";
import { MembersCard } from "./members";

const CONDITION_LABEL: Record<string, string> = { new: "新成屋", resale: "中古屋", old: "老屋" };

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await getAppContext();
  const org = await getCurrentOrgFromCookie(ctx);
  const detail = await getProjectDetail(
    {
      orgId: org.organizationId,
      role: org.role,
      canViewCost: org.canViewCost,
      canViewUnitPrice: org.canViewUnitPrice,
    },
    id,
  );
  if (!detail) notFound();

  const rows = await listProjectFiles({ orgId: org.organizationId }, id);
  // 圖片縮圖：一次批次產生 600 秒簽名網址（使用者的 RLS client）
  const thumbs = await createSignedThumbUrls({ orgId: org.organizationId }, rows);
  const files: FileView[] = rows.map((f) => ({ ...f, thumbUrl: thumbs.get(f.id) ?? null }));

  const toView = (m: { userId: string; email: string; role: "admin" | "designer" | "supervisor" }) => ({
    userId: m.userId,
    label: emailPrefix(m.email),
    role: m.role,
  });

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
          <StatusBadge status={detail.status} />
        </div>
        {detail.perms.canEdit && (
          <Button asChild variant="outline">
            <Link href={`/projects/${detail.id}/edit`}>
              <Pencil /> 編輯
            </Link>
          </Button>
        )}
      </div>

      <section aria-label="案場資料" className="rounded-xl border p-4">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Item label="行政區">{detail.district ?? "—"}</Item>
          <Item label="坪數">{detail.ping ? `${detail.ping} 坪` : "—"}</Item>
          <Item label="屋況">{detail.condition ? (CONDITION_LABEL[detail.condition] ?? "—") : "—"}</Item>
          <Item label="樓層">{detail.floor ?? "—"}</Item>
          <Item label="電梯">{detail.hasElevator === null ? "不確定" : detail.hasElevator ? "有" : "無"}</Item>
          <Item label="狀態">{PROJECT_STATUS_LABEL[detail.status]}</Item>
          <div className="col-span-2 md:col-span-3">
            <Item label="地址">{detail.addressUnreadable ? "（無法讀取地址）" : detail.address || "—"}</Item>
          </div>
          {detail.hoaRules && (
            <div className="col-span-2 md:col-span-3">
              <Item label="社區規約">
                <span className="whitespace-pre-wrap">{detail.hoaRules}</span>
              </Item>
            </div>
          )}
        </dl>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {detail.client && <ClientCard projectId={detail.id} name={detail.client.name} />}
        <MembersCard
          projectId={detail.id}
          members={detail.members.map(toView)}
          addable={detail.addableMembers.map(toView)}
          canManage={detail.perms.canManageMembers}
        />
      </div>

      <FilesCard
        orgId={org.organizationId}
        projectId={detail.id}
        files={files}
        canUploadAll={detail.perms.canEdit}
        canDelete={detail.perms.canDeleteFiles}
      />
    </main>
  );
}
