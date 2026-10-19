import { describe, expect, test } from "vitest";
import { D } from "@/lib/money/decimal";
import {
  allocateProportionally,
  costSourceLabel,
  resolveEffectiveCosts,
} from "@/domain/pricing/effective-cost";

const q = (id: string, amount: string, pricedOn: string, createdAt = `${pricedOn}T00:00:00Z`) =>
  ({ costItemId: id, source: "quote" as const, amount: D(amount), pricedOn, createdAt });

describe("effective-cost", () => {
  test("有結算時採用結算", () => {
    const m = resolveEffectiveCosts([q("a", "7000", "2025-07-14"),
      { costItemId: "a", source: "settlement", amount: D("6800"), pricedOn: "2026-01-21", createdAt: "2026-01-21T00:00:00Z" }], []);
    expect(m.get("a")).toMatchObject({ source: "settlement", date: "2026-01-21" });
    expect(m.get("a")!.amount.toString()).toBe("6800");
    expect(costSourceLabel(m.get("a")!)).toBe("結算");
  });
  test("同項目多筆結算取 createdAt 最晚者", () => {
    const s = (amt: string, createdAt: string) =>
      ({ costItemId: "a", source: "settlement" as const, amount: D(amt), pricedOn: "2026-01-21", createdAt });
    const m = resolveEffectiveCosts([s("1", "2026-01-21T01:00:00Z"), s("2", "2026-01-21T09:00:00Z")], []);
    expect(m.get("a")!.amount.toString()).toBe("2");
  });
  test("沒有結算時採用最新報價；同日取建立時間較晚者", () => {
    const m = resolveEffectiveCosts([
      q("a", "1000", "2025-07-01"), q("a", "1200", "2025-07-14", "2025-07-14T01:00:00Z"),
      q("a", "1100", "2025-07-14", "2025-07-14T09:00:00Z")], []);
    expect(m.get("a")!.amount.toString()).toBe("1100");
    expect(costSourceLabel(m.get("a")!)).toBe("報價（2025-07-14）");
  });
  test("整筆結算依最新報價比例分攤，加總恰好等於結算額", () => {
    const prices = [q("a", "24050", "2025-07-14"), q("b", "11542.5", "2025-07-14"), q("c", "68970", "2025-07-14")];
    const m = resolveEffectiveCosts(prices, [{ vendorDocumentId: "d", amount: D("120000"), costItemIds: ["a", "b", "c"], settledOn: "2026-01-21" }]);
    const total = ["a", "b", "c"].reduce((s, id) => s.plus(m.get(id)!.amount), D(0));
    expect(total.toString()).toBe("120000");
    expect(costSourceLabel(m.get("a")!)).toBe("結算（分攤）");
    expect(m.get("a")!.date).toBe("2026-01-21");
  });
  test("文件中已有自己結算的項目先扣除，其餘再分攤", () => {
    const prices = [q("a", "100", "2025-07-14"), q("b", "100", "2025-07-14"),
      { costItemId: "a", source: "settlement" as const, amount: D("150"), pricedOn: "2026-01-21", createdAt: "2026-01-21T00:00:00Z" }];
    const m = resolveEffectiveCosts(prices, [{ vendorDocumentId: "d", amount: D("400"), costItemIds: ["a", "b"], settledOn: "2026-01-21" }]);
    expect(m.get("a")!.amount.toString()).toBe("150");
    expect(m.get("b")!.amount.toString()).toBe("250");
  });
  test("殘額為負時仍分攤、不丟錯", () => {
    const prices = [q("b", "100", "2025-07-14"),
      { costItemId: "a", source: "settlement" as const, amount: D("500"), pricedOn: "2026-01-21", createdAt: "2026-01-21T00:00:00Z" }];
    const m = resolveEffectiveCosts(prices, [{ vendorDocumentId: "d", amount: D("400"), costItemIds: ["a", "b"], settledOn: "2026-01-21" }]);
    expect(m.get("b")!.amount.toString()).toBe("-100");
  });
  test("文件內無任何報價的項目權重為 0，仍取得分攤", () => {
    const m = resolveEffectiveCosts([q("a", "100", "2025-07-14")],
      [{ vendorDocumentId: "d", amount: D("300"), costItemIds: ["a", "z"], settledOn: "2026-01-21" }]);
    expect(m.get("a")!.amount.toString()).toBe("300");
    expect(m.get("z")!.amount.toString()).toBe("0");
    expect(m.get("z")!.source).toBe("settlement_allocated");
  });
  test("項目出現在多份文件結算時取陣列中第一份", () => {
    const m = resolveEffectiveCosts([q("a", "100", "2025-07-14")], [
      { vendorDocumentId: "d1", amount: D("500"), costItemIds: ["a"], settledOn: "2026-01-01" },
      { vendorDocumentId: "d2", amount: D("900"), costItemIds: ["a"], settledOn: "2026-02-01" }]);
    expect(m.get("a")!.amount.toString()).toBe("500");
    expect(m.get("a")!.date).toBe("2026-01-01");
  });
  test("權重全為 0 時平均分攤；只有一份時全給該份", () => {
    const even = allocateProportionally(D("100"), [{ id: "a", weight: D(0) }, { id: "b", weight: D(0) }, { id: "c", weight: D(0) }]);
    expect([...even.values()].map(String)).toEqual(["34", "33", "33"]);
    expect(allocateProportionally(D("120000"), [{ id: "a", weight: D(0) }]).get("a")!.toString()).toBe("120000");
  });
  test("沒有任何價格時不在結果中，標籤為「無成本」", () => {
    expect(resolveEffectiveCosts([], []).has("x")).toBe(false);
    expect(costSourceLabel(null)).toBe("無成本");
  });
});
