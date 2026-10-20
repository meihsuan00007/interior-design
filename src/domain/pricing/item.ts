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
  const byId = new Map<string, QuoteItemInput>();
  for (const i of items) {
    if (byId.has(i.id)) throw new Error(`項目 id 重複：${i.id}`);
    byId.set(i.id, i);
  }
  for (const i of items) {
    if (i.parentId === null) continue;
    const parent = byId.get(i.parentId);
    if (!parent) throw new Error(`項目 ${i.id} 的母項 ${i.parentId} 不存在`);
    if (parent.parentId !== null) throw new Error(`項目 ${i.id} 的母項 ${parent.id} 本身也是子項，只支援單層母子`);
  }

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
    // 子項的 includeInMgmtFee 不採用，由母項決定計入 S1 或 S2。
    const children = i.parentId === null ? (childrenOf.get(i.id) ?? []) : [];
    // 選配、業主自備、業主直付、管銷服務的子項，金額不併入母項。
    const amountChildren = children.filter(
      (c) => !c.isOptional && !c.isOwnerSupplied && !c.isPaidDirectlyByOwner && !c.isComplimentary,
    );
    // 成本：管銷服務子項的成本仍併入，其餘排除同上。
    const costChildren = children.filter((c) => !c.isOptional && !c.isOwnerSupplied && !c.isPaidDirectlyByOwner);
    const clientTotal = own.plus(sum(amountChildren.map(ownAmountOf)));
    const links = [...i.costLinks, ...costChildren.flatMap((c) => c.costLinks)];
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
