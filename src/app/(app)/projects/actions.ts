"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { projectSchema } from "@/lib/validation/project";
import { formString, runWrite, validationFailure, type ActionResult } from "@/server/actions";
import { createProject, updateProject } from "@/server/projects/mutations";

const idSchema = z.uuid();

function parseForm(fd: FormData) {
  const elevator = formString(fd, "hasElevator");
  return projectSchema.safeParse({
    name: formString(fd, "name"),
    district: formString(fd, "district"),
    addressFull: formString(fd, "addressFull"),
    addressTouched: formString(fd, "addressTouched") === "1",
    ping: formString(fd, "ping"),
    condition: formString(fd, "condition"),
    floor: formString(fd, "floor"),
    hasElevator: elevator === "true" ? true : elevator === "false" ? false : null,
    hoaRules: formString(fd, "hoaRules"),
    status: formString(fd, "status") || "lead",
    // 監工看不到業主區塊也不會送出；就算送出，伺服器端 canHandleClient 也會忽略
    clientName: formString(fd, "clientName"),
    clientPhone: formString(fd, "clientPhone"),
    clientEmail: formString(fd, "clientEmail"),
    clientNationalId: formString(fd, "clientNationalId"),
  });
}

const WRITE = { revalidate: "/projects", roles: ["admin", "designer"] as ("admin" | "designer")[], label: "案場操作失敗" };

export async function createProjectAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = parseForm(fd);
  if (!parsed.success) return validationFailure(parsed.error);
  let newId = "";
  const result = await runWrite(WRITE, async (org) => {
    newId = await createProject({ orgId: org.organizationId, role: org.role }, parsed.data);
  });
  if (!result.ok) return result;
  redirect(`/projects/${newId}`);
}

export async function updateProjectAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = idSchema.safeParse(formString(fd, "id"));
  if (!id.success) return { ok: false, message: "找不到案場" };
  const parsed = parseForm(fd);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await runWrite(WRITE, (org) =>
    updateProject({ orgId: org.organizationId, role: org.role }, id.data, parsed.data),
  );
  if (!result.ok) return result;
  redirect(`/projects/${id.data}`);
}
