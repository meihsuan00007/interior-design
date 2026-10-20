import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/db/schema/projects";
import { getAppContext, getCurrentOrgFromCookie } from "@/server/context";
import { canHandleClient } from "@/server/projects/mutations";
import { getProjectForEdit } from "@/server/projects/queries";
import { updateProjectAction } from "../../actions";
import { ProjectForm } from "../../form";

const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }));

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await getAppContext();
  const org = await getCurrentOrgFromCookie(ctx);
  // 監工不能編輯案場
  if (org.role === "supervisor") redirect("/projects");

  const project = await getProjectForEdit({ orgId: org.organizationId, role: org.role }, id);
  if (!project) notFound();

  return (
    <main className="space-y-6 px-4 py-6 md:px-6 md:py-8">
      <h1 className="mx-auto w-full max-w-xl text-2xl font-semibold tracking-tight">編輯案場</h1>
      <ProjectForm
        action={updateProjectAction}
        statusOptions={STATUS_OPTIONS}
        projectId={project.id}
        initial={{
          name: project.name,
          district: project.district,
          addressFull: project.addressFull,
          ping: project.ping,
          condition: project.condition,
          floor: project.floor,
          hasElevator: project.hasElevator === null ? "" : String(project.hasElevator),
          hoaRules: project.hoaRules,
          status: project.status,
          clientName: project.clientName,
        }}
        showClient={canHandleClient(org.role)}
        hasClient={project.hasClient}
        addressUnreadable={project.addressUnreadable}
      />
    </main>
  );
}
