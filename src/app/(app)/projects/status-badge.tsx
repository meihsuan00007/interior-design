import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/db/schema/projects";
import { cn } from "@/lib/utils";

const TONE: Record<ProjectStatus, string> = {
  lead: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  quoting: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  contracted: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  in_progress: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  completed: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  warranty: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  archived: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge className={cn("border-transparent", TONE[status])}>{PROJECT_STATUS_LABEL[status]}</Badge>;
}
