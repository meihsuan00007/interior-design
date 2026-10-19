import type Decimal from "decimal.js";
import { D, roundYuan, sum } from "@/lib/money/decimal";
import { computeItems } from "./item";
import type { QuoteTotals, QuoteTotalsInput } from "./types";

const TAX_RATE = D("0.05");

/** 計算報價單總計（D7 計算順序：S1、S2、管理費、其他費用、折讓、未稅合計、稅）。 */
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const results = computeItems(input.items, input.effectiveCosts);
  const byId = new Map(input.items.map((i) => [i.id, i]));

  let s1 = D(0);
  let s2 = D(0);
  let costTotal = D(0);
  let itemsTotal = D(0);
  let settlement = 0;
  let quote = 0;
  let none = 0;

  for (const r of results) {
    const src = byId.get(r.id)!;
    if (src.parentId !== null) continue;
    if (r.countsInTotal) {
      itemsTotal = itemsTotal.plus(r.clientTotal);
      if (src.includeInMgmtFee) s1 = s1.plus(r.clientTotal);
      else s2 = s2.plus(r.clientTotal);
    }
    if (r.countsInTotal || src.isComplimentary) {
      costTotal = costTotal.plus(r.cost ?? 0);
      if (r.costSource === null) none++;
      else if (r.costSource === "settlement" || r.costSource === "settlement_allocated") settlement++;
      else quote++;
    }
  }

  const mgmtFee = roundYuan(s1.times(input.mgmtFeeRate));
  const feeBase = s1.plus(s2);
  const otherFees = sum(
    input.fees.map((f) => (f.mode === "fixed" ? roundYuan(f.value) : roundYuan(feeBase.times(f.value)))),
  );
  const netTotal = s1.plus(s2).plus(mgmtFee).plus(otherFees).minus(input.discount);

  let tax: Decimal;
  let grandTotal: Decimal;
  if (input.taxMode === "exclusive") {
    tax = roundYuan(netTotal.times(TAX_RATE));
    grandTotal = netTotal.plus(tax);
  } else {
    tax = roundYuan(netTotal.times(5).div(105));
    grandTotal = netTotal;
  }

  const totalMargin = netTotal.minus(costTotal);
  const parts: string[] = [];
  if (settlement > 0) parts.push(`${settlement} 項結算`);
  if (quote > 0) parts.push(`${quote} 項報價`);
  if (none > 0) parts.push(`${none} 項無成本`);

  return {
    s1,
    s2,
    mgmtFee,
    otherFees,
    discount: input.discount,
    netTotal,
    tax,
    grandTotal,
    costTotal,
    itemsMargin: itemsTotal.minus(costTotal),
    totalMargin,
    markupRate: costTotal.isZero() ? null : netTotal.div(costTotal),
    marginRate: netTotal.isZero() ? null : totalMargin.div(netTotal),
    costSourceSummary: { settlement, quote, none, label: parts.join("／"), isMixed: parts.length >= 2 },
    items: results,
  };
}
