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

export interface QuoteItemInput {
  id: string;
  parentId: string | null;
  quantity: Decimal | null;
  clientUnitPrice: Decimal | null;
  isOptional: boolean;
  /** 管銷服務項目（對客 0 元、有成本） */
  isComplimentary: boolean;
  isOwnerSupplied: boolean;
  isPaidDirectlyByOwner: boolean;
  includeInMgmtFee: boolean;
  costLinks: { costItemId: string; allocationRatio: Decimal }[];
}

export interface QuoteItemResult {
  id: string;
  ownAmount: Decimal;
  clientTotal: Decimal;
  countsInTotal: boolean;
  cost: Decimal | null;
  costSource: EffectiveSource | "mixed" | null;
  costDate: string | null;
  margin: Decimal | null;
  markupRate: Decimal | null;
  marginRate: Decimal | null;
}

export type TaxMode = "exclusive" | "inclusive";

export interface QuoteFeeInput {
  kind: "design" | "warranty" | "other";
  mode: "percent" | "fixed";
  /** percent 時為小數（0.05 = 5%） */
  value: Decimal;
}

export interface QuoteTotalsInput {
  items: QuoteItemInput[];
  effectiveCosts: Map<string, EffectiveCost>;
  mgmtFeeRate: Decimal;
  fees: QuoteFeeInput[];
  discount: Decimal;
  taxMode: TaxMode;
}

export interface QuoteTotals {
  s1: Decimal;
  s2: Decimal;
  mgmtFee: Decimal;
  otherFees: Decimal;
  discount: Decimal;
  netTotal: Decimal;
  tax: Decimal;
  grandTotal: Decimal;
  costTotal: Decimal;
  itemsMargin: Decimal;
  totalMargin: Decimal;
  markupRate: Decimal | null;
  marginRate: Decimal | null;
  costSourceSummary: {
    settlement: number;
    quote: number;
    none: number;
    label: string;
    isMixed: boolean;
  };
  items: QuoteItemResult[];
}
