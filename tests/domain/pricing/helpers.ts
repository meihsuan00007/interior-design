import type { QuoteItemInput } from "@/domain/pricing/types";

/** 測試用項目工廠：預設無數量單價、旗標皆 false、計入管銷、無成本連結。 */
export function item(partial: Partial<QuoteItemInput> & { id: string }): QuoteItemInput {
  return {
    parentId: null,
    quantity: null,
    clientUnitPrice: null,
    isOptional: false,
    isComplimentary: false,
    isOwnerSupplied: false,
    isPaidDirectlyByOwner: false,
    includeInMgmtFee: true,
    costLinks: [],
    ...partial,
  };
}
