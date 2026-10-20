"use server";

import { z } from "zod";
import { vendorSchema } from "@/lib/validation/master";
import {
  formString,
  runMasterWrite,
  validationFailure,
  type ActionResult,
} from "@/server/master/action";
import { createVendor, deleteVendor, updateVendor } from "@/server/master/vendors";

const PATH = "/master/vendors";
const idSchema = z.uuid();

export async function saveVendorAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = vendorSchema.safeParse({
    name: formString(fd, "name"),
    tradeIds: fd.getAll("tradeIds").filter((v): v is string => typeof v === "string"),
    contactName: formString(fd, "contactName"),
    phone: formString(fd, "phone"),
    taxId: formString(fd, "taxId").trim(),
    note: formString(fd, "note"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const id = formString(fd, "id");
  return runMasterWrite(PATH, async (orgId) => {
    if (id) await updateVendor(orgId, idSchema.parse(id), parsed.data);
    else await createVendor(orgId, parsed.data);
  });
}

export async function deleteVendorAction(id: string): Promise<ActionResult> {
  return runMasterWrite(PATH, (orgId) => deleteVendor(orgId, idSchema.parse(id)));
}
