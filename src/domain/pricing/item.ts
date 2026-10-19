import type Decimal from "decimal.js";
import { D, roundYuan, sum } from "@/lib/money/decimal";
import type { EffectiveCost, EffectiveSource, QuoteItemInput, QuoteItemResult } from "./types";

function ownAmountOf(i: QuoteItemInput): Decimal {
  if (i.quantity === null || i.clientUnitPrice === null) return D(0);
  return roundYuan(i.quantity.times(i.clientUnitPrice));
}

/** 彙總一組成本連結；全部連結都沒有有效成本 → cost 為 null。 */
function resolveCost(
  links: QuoteItemInput["costLinks"],
  costs: Map<string, EffectiveCost>,
): { cost: Decimal | null; source: EffectiveSource | "mixed" | null; date: string | null } {
  const parts: Decimal[] = [];
  const sources = new Set<EffectiveSource>();
  let date: string | null = null;
  for (const link of links) {
    const c = costs.get(link.costItemId);
    if (!c) continue;
    parts.push(roundYuan(c.amount.times(link.allocationRatio)));
    sources.add(c.source);
    if (date === null || c.date > date) date = c.date;
  }
  if (parts.length === 0) return { cost: null, source: null, date: null };
  const source = sources.size === 1 ? [...sources][0] : "mixed";
  return { cost: sum(parts), source, date };
}

/** 計算每個項目的對客金額、成本、毛利與加成率（單層母子）。 */
export function computeItems(items: QuoteItemInput[], costs: Map<string, EffectiveCost>): QuoteItemResult[] {
  const childrenOf = new Map<string, QuoteItemInput[]>();
  for (const i of items) {
    if (i.parentId !== null) {
      const list = childrenOf.get(i.parentId) ?? [];
      list.push(i);
      childrenOf.set(i.parentId, list);
    }
  }

  return items.map((i) => {
    const own = ownAmountOf(i);
    const children = i.parentId === null ? (childrenOf.get(i.id) ?? []) : [];
    const clientTotal = children.length > 0 ? own.plus(sum(children.map(ownAmountOf))) : own;
    const links = [...i.costLinks, ...children.flatMap((c) => c.costLinks)];
    const { cost, source, date } = resolveCost(links, costs);

    const margin = cost === null ? null : clientTotal.minus(cost);
    const markupRate = cost === null || cost.isZero() ? null : clientTotal.div(cost);
    const marginRate = clientTotal.isZero() || margin === null ? null : margin.div(clientTotal);
    const countsInTotal =
      i.parentId === null && !i.isOptional && !i.isComplimentary && !i.isOwnerSupplied && !i.isPaidDirectlyByOwner;

    return {
      id: i.id,
      ownAmount: own,
      clientTotal,
      countsInTotal,
      cost,
      costSource: source,
      costDate: date,
      margin,
      markupRate,
      marginRate,
    };
  });
}
