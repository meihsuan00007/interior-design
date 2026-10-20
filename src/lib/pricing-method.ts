// 計價方式標籤。刻意不匯入資料庫 schema，讓 Client Component 可安全引用。
export type PricingMethod = "unit_x_qty" | "per_ping" | "lump_sum" | "package" | "percent";

export const PRICING_METHOD_LABEL: Record<PricingMethod, string> = {
  unit_x_qty: "單價 × 數量",
  per_ping: "按坪數",
  lump_sum: "一式",
  package: "套裝方案",
  percent: "百分比加成",
};

export const PRICING_METHOD_OPTIONS = (Object.keys(PRICING_METHOD_LABEL) as PricingMethod[]).map((value) => ({
  value,
  label: PRICING_METHOD_LABEL[value],
}));
