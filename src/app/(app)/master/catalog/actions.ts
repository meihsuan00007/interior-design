"use server";

import { z } from "zod";
import { catalogItemSchema } from "@/lib/validation/master";
import {
  formNullable,
  formString,
  runMasterWrite,
  validationFailure,
  type ActionResult,
} from "@/server/master/action";
import { createCatalogItem, deleteCatalogItem, updateCatalogItem } from "@/server/master/catalog";

const PATH = "/master/catalog";
const idSchema = z.uuid();

export async function saveCatalogItemAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = catalogItemSchema.safeParse({
    name: formString(fd, "name"),
    tradeId: formNullable(fd, "tradeId"),
    unitId: formNullable(fd, "unitId"),
    spec: formString(fd, "spec"),
    defaultVendorId: formNullable(fd, "defaultVendorId"),
    pricingMethod: formString(fd, "pricingMethod"),
    note: formString(fd, "note"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const id = formString(fd, "id");
  return runMasterWrite(PATH, async (orgId) => {
    if (id) await updateCatalogItem(orgId, idSchema.parse(id), parsed.data);
    else await createCatalogItem(orgId, parsed.data);
  });
}

export async function deleteCatalogItemAction(id: string): Promise<ActionResult> {
  return runMasterWrite(PATH, (orgId) => deleteCatalogItem(orgId, idSchema.parse(id)));
}
