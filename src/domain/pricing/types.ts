import type Decimal from "decimal.js";

export type CostPriceSource = "quote" | "settlement";

/** 成本項目的一筆價格（報價或結算）。 */
export interface CostPrice {
  costItemId: string;
  source: CostPriceSource;
  amount: Decimal;
  /** YYYY-MM-DD */
  pricedOn: string;
  /** ISO 時間字串 */
  createdAt: string;
}

/** 廠商文件層級的整筆結算。 */
export interface DocumentSettlement {
  vendorDocumentId: string;
  amount: Decimal;
  costItemIds: string[];
  /** YYYY-MM-DD，作為分攤結果的日期 */
  settledOn: string;
}

export type EffectiveSource = "settlement" | "settlement_allocated" | "quote";

export interface EffectiveCost {
  amount: Decimal;
  source: EffectiveSource;
  date: string;
}
