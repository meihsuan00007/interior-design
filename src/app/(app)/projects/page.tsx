import { Plus } from "lucide-react";
import Link from "next/link";
import { ListItem } from "@/components/motion/list-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/db/schema/projects";
import { MAX_QUERY_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { getAppContext, getCurrentOrgFromCookie } from "@/server/context";
import {
  listProjects,
  type ProjectListRow,
  type ProjectStatusFilter,
} from "@/server/projects/queries";
import { ProjectSearch } from "./search";
import { StatusBadge } from "./status-badge";

const CHIPS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "active", label: "全部進行中" },
  ...PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] })),
];

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function parseStatus(v: string): ProjectStatusFilter {
  return (PROJECT_STATUSES as readonly string[]).includes(v) ? (v as ProjectStatus) : "active";
}

const dateFormat = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium" });

function chipHref(status: ProjectStatusFilter, q: string): string {
  const sp = new URLSearchParams();
  if (status !== "active") sp.set("status", status);
  if (q) sp.set("q", q);
  const qs = sp.toString();
  return qs ? `/projects?${qs}` : "/projects";
}

function Meta({ p }: { p: ProjectListRow }) {
  return (
    <>
      {p.district ?? "—"}
      {p.ping ? ` ・ ${p.ping} 坪` : ""}
    </>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, MAX_QUERY_LENGTH);
  const status = parseStatus(first(sp.status));

  const ctx = await getAppContext();
  const org = await getCurrentOrgFromCookie(ctx);
  const canManage = org.role === "admin" || org.role === "designer";
  const projects = await listProjects({ orgId: org.organizationId }, { q, status });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">案場</h1>
        {canManage && (
          <Button asChild className="hidden md:inline-flex">
            <Link href="/projects/new">
              <Plus /> 新增案場
            </Link>
          </Button>
        )}
      </div>

      <ProjectSearch />

      <nav aria-label="狀態篩選" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {CHIPS.map((c) => (
          <Link
            key={c.value}
            href={chipHref(c.value, q)}
            aria-current={c.value === status ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              c.value === status
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      {projects.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {q || status !== "active" ? "沒有符合條件的案場" : "尚無案場"}
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <tr className="border-b">
                  <TableHead>案名</TableHead>
                  <TableHead>行政區</TableHead>
                  <TableHead>坪數</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>更新日期</TableHead>
                  {canManage && <TableHead className="w-20 text-right">操作</TableHead>}
                </tr>
              </TableHeader>
              <TableBody>
                {projects.map((p, i) => (
                  <ListItem key={p.id} as="tr" index={i} className="border-b transition-colors hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <Link href={`/projects/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.district ?? "—"}</TableCell>
                    <TableCell>{p.ping ? `${p.ping} 坪` : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{dateFormat.format(new Date(p.updatedAt))}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Link href={`/projects/${p.id}/edit`} className="text-sm text-primary hover:underline">
                          編輯
                        </Link>
                      </TableCell>
                    )}
                  </ListItem>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {projects.map((p, i) => (
              <ListItem key={p.id} index={i}>
                <Card>
                  <CardContent className="space-y-3">
                    <Link href={`/projects/${p.id}`} className="block space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{p.name}</p>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <Meta p={p} />
                      </p>
                    </Link>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>更新於 {dateFormat.format(new Date(p.updatedAt))}</span>
                      {canManage && (
                        <Link href={`/projects/${p.id}/edit`} className="py-1 text-sm text-primary">
                          編輯
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </ListItem>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
