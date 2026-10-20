import { describe, expect, test } from "vitest";
import { D } from "@/lib/money/decimal";
import { computeQuoteTotals } from "@/domain/pricing/totals";
import type { QuoteTotalsInput } from "@/domain/pricing/types";
import { item } from "./helpers";

function input(over: Partial<QuoteTotalsInput> & Pick<QuoteTotalsInput, "items">): QuoteTotalsInput {
  return { effectiveCosts: new Map(), mgmtFeeRate: D("0.10"), fees: [], discount: D(0), taxMode: "exclusive", ...over };
}

describe("computeQuoteTotals", () => {
  test("管理費 10%：計入小計 2,156,410 → 215,641，未稅合計 2,372,051", () => {
    const t = computeQuoteTotals(input({ items: [item({ id: "a", quantity: D(1), clientUnitPrice: D("2156410") })] }));
    expect(t.mgmtFee.toString()).toBe("215641");
    expect(t.netTotal.toString()).toBe("2372051");
    expect(t.tax.toString()).toBe("118603");
    expect(t.grandTotal.toString()).toBe("2490654");
  });
  test("代購計入 S2、不計管理費；業主直付不計入任何總計", () => {
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "a", quantity: D(1), clientUnitPrice: D("100000") }),
          item({ id: "b", quantity: D(1), clientUnitPrice: D("40743"), includeInMgmtFee: false }),
          item({ id: "c", quantity: D(1), clientUnitPrice: D("69500"), includeInMgmtFee: false, isPaidDirectlyByOwner: true }),
        ],
      }),
    );
    expect([t.s1, t.s2, t.mgmtFee, t.netTotal].map(String)).toEqual(["100000", "40743", "10000", "150743"]);
  });
  test("折讓不影響管理費；內含稅只顯示稅額", () => {
    const t = computeQuoteTotals(
      input({ items: [item({ id: "a", quantity: D(1), clientUnitPrice: D("105000") })], discount: D("5500"), taxMode: "inclusive" }),
    );
    expect(t.mgmtFee.toString()).toBe("10500");
    expect(t.netTotal.toString()).toBe("110000");
    expect(t.tax.toString()).toBe("5238");
    expect(t.grandTotal.toString()).toBe("110000");
    expect(t.discount.toString()).toBe("5500");
  });
  test("追減的 .5 邊界：-11542.5 → -11543", () => {
    const t = computeQuoteTotals(input({ items: [item({ id: "a", quantity: D("-17.1"), clientUnitPrice: D("675") })] }));
    expect(t.s1.toString()).toBe("-11543");
  });
  test("其他費用：固定與百分比（基礎 S1+S2）", () => {
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "a", quantity: D(1), clientUnitPrice: D("100000") }),
          item({ id: "b", quantity: D(1), clientUnitPrice: D("20000"), includeInMgmtFee: false }),
        ],
        fees: [
          { kind: "design", mode: "percent", value: D("0.05") },
          { kind: "other", mode: "fixed", value: D("1234") },
        ],
      }),
    );
    expect(t.otherFees.toString()).toBe("7234");
    expect(t.netTotal.toString()).toBe("137234");
  });
  test("成本來源統計：混用時顯示提示", () => {
    const costs = new Map([
      ["c1", { amount: D("100"), source: "settlement" as const, date: "2026-01-21" }],
      ["c2", { amount: D("100"), source: "quote" as const, date: "2025-07-14" }],
    ]);
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "a", quantity: D(1), clientUnitPrice: D("200"), costLinks: [{ costItemId: "c1", allocationRatio: D(1) }] }),
          item({ id: "b", quantity: D(1), clientUnitPrice: D("200"), costLinks: [{ costItemId: "c2", allocationRatio: D(1) }] }),
          item({ id: "c", quantity: D(1), clientUnitPrice: D("200") }),
        ],
        effectiveCosts: costs,
      }),
    );
    expect(t.costSourceSummary.label).toBe("1 項結算／1 項報價／1 項無成本");
    expect(t.costSourceSummary.isMixed).toBe(true);
  });
  test("管銷服務的成本計入總成本", () => {
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "a", quantity: D(1), clientUnitPrice: D("1000"), costLinks: [{ costItemId: "c1", allocationRatio: D(1) }] }),
          item({ id: "b", quantity: D(1), clientUnitPrice: D(0), isComplimentary: true, costLinks: [{ costItemId: "c2", allocationRatio: D(1) }] }),
        ],
        effectiveCosts: new Map([
          ["c1", { amount: D("700"), source: "quote" as const, date: "2025-07-14" }],
          ["c2", { amount: D("100"), source: "quote" as const, date: "2025-07-14" }],
        ]),
      }),
    );
    expect(t.costTotal.toString()).toBe("800");
  });
  test("毛利與比率：以未稅合計對成本", () => {
    const t = computeQuoteTotals(
      input({
        items: [item({ id: "a", quantity: D(1), clientUnitPrice: D("1000"), costLinks: [{ costItemId: "c1", allocationRatio: D(1) }] })],
        effectiveCosts: new Map([["c1", { amount: D("500"), source: "quote" as const, date: "2025-07-14" }]]),
      }),
    );
    expect(t.itemsMargin.toString()).toBe("500");
    expect(t.totalMargin.toString()).toBe("600");
    expect(t.markupRate!.toString()).toBe("2.2");
  });
  test("全無成本：label 為空、不混用；無項目時比率 null", () => {
    const t = computeQuoteTotals(input({ items: [] }));
    expect(t.costSourceSummary.label).toBe("");
    expect(t.costSourceSummary.isMixed).toBe(false);
    expect(t.markupRate).toBeNull();
    expect(t.marginRate).toBeNull();
  });
  test("母項帶業主直付子項：S1 只含母項", () => {
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "p", quantity: D(1), clientUnitPrice: D("100000") }),
          item({ id: "k", parentId: "p", quantity: D(1), clientUnitPrice: D("69500"), isPaidDirectlyByOwner: true, includeInMgmtFee: false }),
        ],
      }),
    );
    expect([t.s1, t.mgmtFee].map(String)).toEqual(["100000", "10000"]);
    expect(t.items.find((r) => r.id === "p")!.clientTotal.toString()).toBe("100000");
  });
  test("母項帶計入的子項：以合計進 S1", () => {
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "p", quantity: D(1), clientUnitPrice: D("1000") }),
          item({ id: "k", parentId: "p", quantity: D(2), clientUnitPrice: D("250") }),
        ],
      }),
    );
    expect(t.s1.toString()).toBe("1500");
  });
  test("選配、業主自備、管銷服務不進 S1／S2", () => {
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "a", quantity: D(1), clientUnitPrice: D("100") }),
          item({ id: "b", quantity: D(1), clientUnitPrice: D("200"), isOptional: true }),
          item({ id: "c", quantity: D(1), clientUnitPrice: D("300"), isOwnerSupplied: true, includeInMgmtFee: false }),
          item({ id: "d", quantity: D(1), clientUnitPrice: D("400"), isComplimentary: true, includeInMgmtFee: false }),
        ],
      }),
    );
    expect([t.s1, t.s2].map(String)).toEqual(["100", "0"]);
  });
  test("成本來源：分攤結算算結算，混用來源算報價", () => {
    const link = (id: string) => ({ costItemId: id, allocationRatio: D(1) });
    const t = computeQuoteTotals(
      input({
        items: [
          item({ id: "a", quantity: D(1), clientUnitPrice: D("100"), costLinks: [link("c1")] }),
          item({ id: "b", quantity: D(1), clientUnitPrice: D("100"), costLinks: [link("c2"), link("c3")] }),
        ],
        effectiveCosts: new Map([
          ["c1", { amount: D("50"), source: "settlement_allocated" as const, date: "2026-01-01" }],
          ["c2", { amount: D("50"), source: "settlement" as const, date: "2026-01-01" }],
          ["c3", { amount: D("50"), source: "quote" as const, date: "2026-01-01" }],
        ]),
      }),
    );
    expect(t.costSourceSummary.label).toBe("1 項結算／1 項報價");
  });
  test("管銷服務同時為選配時，成本不計入總成本", () => {
    const t = computeQuoteTotals(
      input({
        items: [item({ id: "a", quantity: D(1), clientUnitPrice: D(0), isComplimentary: true, isOptional: true, costLinks: [{ costItemId: "c", allocationRatio: D(1) }] })],
        effectiveCosts: new Map([["c", { amount: D("100"), source: "quote" as const, date: "2025-07-14" }]]),
      }),
    );
    expect(t.costTotal.toString()).toBe("0");
  });
});
