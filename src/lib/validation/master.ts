import { z } from "zod";
import { PRICING_METHODS } from "@/db/schema/master";

export { PRICING_METHOD_LABEL, type PricingMethod } from "@/lib/pricing-method";

const sort = z
  .number({ message: "排序必須是數字" })
  .int("排序必須是整數")
  .min(0, "排序不可小於 0")
  .max(9999, "排序不可大於 9999");

const text = (label: string, max: number) =>
  z.string().max(max, `${label}最多 ${max} 字`);

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `請輸入${label}`).max(max, `${label}最多 ${max} 字`);

export const tradeSchema = z
  .object({
    name: requiredText("工種名稱", 30),
    sort,
    defaultIncludeInMgmtFee: z.boolean(),
    isProxyPurchase: z.boolean(),
  })
  .refine((v) => !(v.isProxyPurchase && v.defaultIncludeInMgmtFee), {
    message: "代購工種不可預設計入管銷",
    path: ["defaultIncludeInMgmtFee"],
  });

export const unitSchema = z.object({
  name: requiredText("單位名稱", 10),
  sort,
});

export const catalogItemSchema = z.object({
  name: requiredText("品項名稱", 100),
  tradeId: z.uuid({ message: "工種格式不正確" }).nullable(),
  unitId: z.uuid({ message: "單位格式不正確" }).nullable(),
  spec: text("規格", 500),
  defaultVendorId: z.uuid({ message: "廠商格式不正確" }).nullable(),
  pricingMethod: z.enum(PRICING_METHODS, { message: "計價方式不正確" }),
  note: text("備註", 1000),
});

export const vendorSchema = z.object({
  name: requiredText("廠商名稱", 60),
  tradeIds: z.array(z.uuid({ message: "工種格式不正確" })),
  contactName: text("聯絡人", 30),
  phone: text("電話", 20),
  taxId: z.string().regex(/^(\d{8})?$/, "統編必須是 8 位數字"),
  note: text("備註", 1000),
});

export type TradeInput = z.infer<typeof tradeSchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
