import { D, roundYuan, sum } from "@/lib/money/decimal";
import type Decimal from "decimal.js";
import type { CostPrice, DocumentSettlement, EffectiveCost } from "./types";

/** 取最新一筆：先比 pricedOn，同日再比 createdAt。 */
function latest(prices: CostPrice[]): CostPrice {
  return prices.reduce((best, p) =>
    p.pricedOn > best.pricedOn || (p.pricedOn === best.pricedOn && p.createdAt > best.createdAt) ? p : best,
  );
}

/** 依權重比例分攤；每份四捨五入到元，差額加到原始比例值最大者（同值取第一個）。 */
export function allocateProportionally(
  total: Decimal,
  weights: { id: string; weight: Decimal }[],
): Map<string, Decimal> {
  const result = new Map<string, Decimal>();
  if (weights.length === 0) return result;
  const weightSum = sum(weights.map((w) => w.weight));
  const raws = weights.map((w) =>
    weightSum.isZero() ? total.div(weights.length) : total.times(w.weight).div(weightSum),
  );
  const rounded = raws.map(roundYuan);
  const diff = total.minus(sum(rounded));
  if (!diff.isZero()) {
    let maxIdx = 0;
    raws.forEach((r, i) => {
      if (r.gt(raws[maxIdx])) maxIdx = i;
    });
    rounded[maxIdx] = rounded[maxIdx].plus(diff);
  }
  weights.forEach((w, i) => result.set(w.id, rounded[i]));
  return result;
}

/** 有效成本：自己的結算 > 文件整筆結算分攤 > 最新報價。沒有任何價格的項目不在結果中。 */
export function resolveEffectiveCosts(
  prices: CostPrice[],
  documentSettlements: DocumentSettlement[],
): Map<string, EffectiveCost> {
  const byItem = new Map<string, { quotes: CostPrice[]; settlements: CostPrice[] }>();
  for (const p of prices) {
    let e = byItem.get(p.costItemId);
    if (!e) byItem.set(p.costItemId, (e = { quotes: [], settlements: [] }));
    (p.source === "settlement" ? e.settlements : e.quotes).push(p);
  }

  const result = new Map<string, EffectiveCost>();

  // 規則 1：自己的結算（createdAt 最晚者）
  for (const [id, e] of byItem) {
    if (e.settlements.length === 0) continue;
    const s = e.settlements.reduce((b, p) => (p.createdAt > b.createdAt ? p : b));
    result.set(id, { amount: s.amount, source: "settlement", date: s.pricedOn });
  }
  const ownSettled = new Set(result.keys());

  // 規則 2：文件整筆結算分攤（同項目出現在多份文件時取第一份）
  const claimed = new Set<string>();
  for (const doc of documentSettlements) {
    const members = [...new Set(doc.costItemIds)];
    const own = members.filter((id) => ownSettled.has(id));
    const rest = members.filter((id) => !ownSettled.has(id) && !claimed.has(id));
    if (rest.length === 0) continue;
    const residual = doc.amount.minus(sum(own.map((id) => result.get(id)!.amount)));
    const weights = rest.map((id) => {
      const quotes = byItem.get(id)?.quotes ?? [];
      return { id, weight: quotes.length > 0 ? latest(quotes).amount : D(0) };
    });
    for (const [id, amount] of allocateProportionally(residual, weights)) {
      result.set(id, { amount, source: "settlement_allocated", date: doc.settledOn });
      claimed.add(id);
    }
  }

  // 規則 3：最新報價
  for (const [id, e] of byItem) {
    if (result.has(id) || e.quotes.length === 0) continue;
    const p = latest(e.quotes);
    result.set(id, { amount: p.amount, source: "quote", date: p.pricedOn });
  }
  return result;
}

export function costSourceLabel(e: EffectiveCost | null): string {
  if (!e) return "無成本";
  if (e.source === "settlement") return "結算";
  if (e.source === "settlement_allocated") return "結算（分攤）";
  return `報價（${e.date}）`;
}
