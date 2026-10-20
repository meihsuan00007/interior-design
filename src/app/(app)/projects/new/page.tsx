import { redirect } from "next/navigation";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/db/schema/projects";
import { getAppContext, getCurrentOrgFromCookie } from "@/server/context";
import { createProjectAction } from "../actions";
import { ProjectForm } from "../form";

const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }));

export default async function NewProjectPage() {
  const ctx = await getAppContext();
  const org = await getCurrentOrgFromCookie(ctx);
  // 監工不能建立案場
  if (org.role === "supervisor") redirect("/projects");

  return (
    <main className="space-y-6 px-4 py-6 md:px-6 md:py-8">
      <h1 className="mx-auto w-full max-w-xl text-2xl font-semibold tracking-tight">新增案場</h1>
      <ProjectForm
        action={createProjectAction}
        statusOptions={STATUS_OPTIONS}
        initial={{
          name: "",
          district: "",
          addressFull: "",
          ping: "",
          condition: "",
          floor: "",
          hasElevator: "",
          hoaRules: "",
          status: "lead",
          clientName: "",
        }}
        showClient
        hasClient={false}
      />
    </main>
  );
}
