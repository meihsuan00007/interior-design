"use server";

import { z } from "zod";
import { unitSchema } from "@/lib/validation/master";
import {
  formInt,
  formString,
  runMasterWrite,
  validationFailure,
  type ActionResult,
} from "@/server/master/action";
import { createUnit, deleteUnit, moveUnit, updateUnit } from "@/server/master/units";

const PATH = "/master/units";
const idSchema = z.uuid();

export async function saveUnitAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = unitSchema.safeParse({ name: formString(fd, "name"), sort: formInt(fd, "sort") });
  if (!parsed.success) return validationFailure(parsed.error);
  const id = formString(fd, "id");
  return runMasterWrite(PATH, async (orgId) => {
    if (id) await updateUnit(orgId, idSchema.parse(id), parsed.data);
    else await createUnit(orgId, parsed.data);
  });
}

export async function deleteUnitAction(id: string): Promise<ActionResult> {
  return runMasterWrite(PATH, (orgId) => deleteUnit(orgId, idSchema.parse(id)));
}

export async function moveUnitAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  return runMasterWrite(PATH, (orgId) => moveUnit(orgId, idSchema.parse(id), direction === "up" ? "up" : "down"));
}
