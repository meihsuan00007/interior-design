"use server";

import { z } from "zod";
import { tradeSchema } from "@/lib/validation/master";
import {
  formBool,
  formInt,
  formString,
  runMasterWrite,
  validationFailure,
  type ActionResult,
} from "@/server/master/action";
import { createTrade, deleteTrade, moveTrade, updateTrade } from "@/server/master/trades";

const PATH = "/master/trades";
const idSchema = z.uuid();
const NOT_FOUND: ActionResult = { ok: false, message: "找不到資料" };

export async function saveTradeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = tradeSchema.safeParse({
    name: formString(fd, "name"),
    sort: formInt(fd, "sort"),
    defaultIncludeInMgmtFee: formBool(fd, "defaultIncludeInMgmtFee"),
    isProxyPurchase: formBool(fd, "isProxyPurchase"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const id = formString(fd, "id");
  if (id && !idSchema.safeParse(id).success) return NOT_FOUND;
  return runMasterWrite(PATH, async (orgId) => {
    if (id) await updateTrade(orgId, id, parsed.data);
    else await createTrade(orgId, parsed.data);
  });
}

export async function deleteTradeAction(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return NOT_FOUND;
  return runMasterWrite(PATH, (orgId) => deleteTrade(orgId, id));
}

export async function moveTradeAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return NOT_FOUND;
  return runMasterWrite(PATH, (orgId) => moveTrade(orgId, id, direction === "up" ? "up" : "down"));
}
