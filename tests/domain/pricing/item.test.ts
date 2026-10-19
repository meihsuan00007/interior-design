import { describe, expect, test } from "vitest";
import { D } from "@/lib/money/decimal";
import { formatMarginRate, formatMarkup } from "@/lib/money/format";
import { computeItems } from "@/domain/pricing/item";
import { item } from "./helpers";

describe("computeItems", () => {
  test("加成率與毛利率：162,000 / 120,000", () => {
    const [r] = computeItems(
      [item({ id: "a", quantity: D(1), clientUnitPrice: D("162000"), costLinks: [{ costItemId: "c", allocationRatio: D(1) }] })],
      new Map([["c", { amount: D("120000"), source: "settlement", date: "2026-01-21" }]]),
    );
    expect(formatMarkup(r.markupRate)).toBe("1.35");
    expect(formatMarginRate(r.marginRate)).toBe("26%");
    expect(r.margin!.toString()).toBe("42000");
    expect(r.costSource).toBe("settlement");
    expect(r.costDate).toBe("2026-01-21");
  });
  test("成本為 0 或沒有成本時加成率為 null", () => {
    const [r] = computeItems([item({ id: "a", quantity: D(1), clientUnitPrice: D("2000") })], new Map());
    expect(r.cost).toBeNull();
    expect(r.markupRate).toBeNull();
    expect(r.margin).toBeNull();
    const [z] = computeItems(
      [item({ id: "a", quantity: D(1), clientUnitPrice: D("2000"), costLinks: [{ costItemId: "c", allocationRatio: D(1) }] })],
      new Map([["c", { amount: D(0), source: "quote", date: "2026-01-01" }]]),
    );
    expect(z.markupRate).toBeNull();
  });
  test("管銷服務：對客 0 元、有成本 → 毛利為負、毛利率 null", () => {
    const [r] = computeItems(
      [item({ id: "a", quantity: D(1), clientUnitPrice: D(0), isComplimentary: true, costLinks: [{ costItemId: "c", allocationRatio: D(1) }] })],
      new Map([["c", { amount: D("5300"), source: "settlement", date: "2026-01-21" }]]),
    );
    expect(r.margin!.toString()).toBe("-5300");
    expect(r.marginRate).toBeNull();
    expect(r.countsInTotal).toBe(false);
  });
  test("母項總價 = 自己的金額 + 有金額的子項", () => {
    const rs = computeItems(
      [
        item({ id: "p", quantity: D(1), clientUnitPrice: D("18000") }),
        item({ id: "c1", parentId: "p", quantity: D(4), clientUnitPrice: D("600") }),
        item({ id: "c2", parentId: "p" }),
      ],
      new Map(),
    );
    expect(rs.find((r) => r.id === "p")!.clientTotal.toString()).toBe("20400");
    expect(rs.find((r) => r.id === "c1")!.countsInTotal).toBe(false);
    expect(rs.find((r) => r.id === "c1")!.clientTotal.toString()).toBe("2400");
  });
  test("母項成本包含子項的成本連結", () => {
    const rs = computeItems(
      [
        item({ id: "p", quantity: D(1), clientUnitPrice: D("1000"), costLinks: [{ costItemId: "c1", allocationRatio: D(1) }] }),
        item({ id: "k", parentId: "p", quantity: D(1), clientUnitPrice: D("500"), costLinks: [{ costItemId: "c2", allocationRatio: D(1) }] }),
      ],
      new Map([
        ["c1", { amount: D("600"), source: "quote", date: "2025-01-01" }],
        ["c2", { amount: D("300"), source: "settlement", date: "2025-03-01" }],
      ]),
    );
    const p = rs.find((r) => r.id === "p")!;
    expect(p.cost!.toString()).toBe("900");
    expect(p.costSource).toBe("mixed");
    expect(p.costDate).toBe("2025-03-01");
  });
  test("多對一：同一成本項目以比例分給兩個對客項目", () => {
    const costs = new Map([["c", { amount: D("23000"), source: "quote" as const, date: "2025-07-14" }]]);
    const rs = computeItems(
      [
        item({ id: "a", quantity: D(3), clientUnitPrice: D("2500"), costLinks: [{ costItemId: "c", allocationRatio: D("0.5") }] }),
        item({ id: "b", quantity: D(2), clientUnitPrice: D("3000"), costLinks: [{ costItemId: "c", allocationRatio: D("0.5") }] }),
      ],
      costs,
    );
    expect(rs.map((r) => r.cost!.toString())).toEqual(["11500", "11500"]);
  });
  test("countsInTotal：選配、業主自備、業主直付皆不計入", () => {
    const rs = computeItems(
      [
        item({ id: "a", quantity: D(1), clientUnitPrice: D(10) }),
        item({ id: "b", isOptional: true }),
        item({ id: "c", isOwnerSupplied: true }),
        item({ id: "d", isPaidDirectlyByOwner: true }),
      ],
      new Map(),
    );
    expect(rs.map((r) => r.countsInTotal)).toEqual([true, false, false, false]);
  });
  test("子項旗標：業主直付與選配子項不併入母項金額與成本", () => {
    const costs = new Map([
      ["c1", { amount: D("10"), source: "quote" as const, date: "2025-01-01" }],
      ["c2", { amount: D("99"), source: "quote" as const, date: "2025-01-01" }],
    ]);
    const link = (id: string) => [{ costItemId: id, allocationRatio: D(1) }];
    const rs = computeItems(
      [
        item({ id: "p", quantity: D(1), clientUnitPrice: D("100000"), costLinks: link("c1") }),
        item({ id: "k1", parentId: "p", quantity: D(1), clientUnitPrice: D("69500"), isPaidDirectlyByOwner: true, costLinks: link("c2") }),
        item({ id: "k2", parentId: "p", quantity: D(1), clientUnitPrice: D("500"), isOptional: true, costLinks: link("c2") }),
      ],
      costs,
    );
    const p = rs.find((r) => r.id === "p")!;
    expect(p.clientTotal.toString()).toBe("100000");
    expect(p.cost!.toString()).toBe("10");
  });
  test("管銷服務子項：成本併入母項，金額不併入", () => {
    const rs = computeItems(
      [
        item({ id: "p", quantity: D(1), clientUnitPrice: D("1000") }),
        item({ id: "k", parentId: "p", quantity: D(1), clientUnitPrice: D("300"), isComplimentary: true, costLinks: [{ costItemId: "c", allocationRatio: D(1) }] }),
      ],
      new Map([["c", { amount: D("80"), source: "quote" as const, date: "2025-01-01" }]]),
    );
    const p = rs.find((r) => r.id === "p")!;
    expect(p.clientTotal.toString()).toBe("1000");
    expect(p.cost!.toString()).toBe("80");
  });
  test("結構錯誤會丟出含 id 的錯誤", () => {
    expect(() => computeItems([item({ id: "x", parentId: "nope" })], new Map())).toThrow(/x/);
    expect(() =>
      computeItems([item({ id: "a" }), item({ id: "b", parentId: "a" }), item({ id: "c", parentId: "b" })], new Map()),
    ).toThrow(/c/);
    expect(() => computeItems([item({ id: "dup" }), item({ id: "dup" })], new Map())).toThrow(/dup/);
  });
});
