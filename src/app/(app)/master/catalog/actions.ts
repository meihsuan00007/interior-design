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
const NOT_FOUND: ActionResult = { ok: false, message: "找不到資料" };

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
  if (id && !idSchema.safeParse(id).success) return NOT_FOUND;
  return runMasterWrite(PATH, async (orgId) => {
    if (id) await updateCatalogItem(orgId, id, parsed.data);
    else await createCatalogItem(orgId, parsed.data);
  });
}

export async function deleteCatalogItemAction(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return NOT_FOUND;
  return runMasterWrite(PATH, (orgId) => deleteCatalogItem(orgId, id));
}
