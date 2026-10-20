import { describe, expect, test } from "vitest";
import {
  PRICING_METHOD_LABEL,
  catalogItemSchema,
  tradeSchema,
  unitSchema,
  vendorSchema,
} from "@/lib/validation/master";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("tradeSchema", () => {
  const ok = { name: "水電", sort: 10, defaultIncludeInMgmtFee: true, isProxyPurchase: false };

  test("合法輸入通過", () => {
    expect(tradeSchema.safeParse(ok).success).toBe(true);
  });

  test("代購工種不可預設計入管銷", () => {
    const r = tradeSchema.safeParse({ ...ok, isProxyPurchase: true, defaultIncludeInMgmtFee: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("代購工種不可預設計入管銷");
      expect(r.error.issues[0].path).toEqual(["defaultIncludeInMgmtFee"]);
    }
    expect(
      tradeSchema.safeParse({ ...ok, isProxyPurchase: true, defaultIncludeInMgmtFee: false }).success,
    ).toBe(true);
  });

  test("名稱長度 1～30", () => {
    expect(tradeSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(tradeSchema.safeParse({ ...ok, name: "工".repeat(30) }).success).toBe(true);
    expect(tradeSchema.safeParse({ ...ok, name: "工".repeat(31) }).success).toBe(false);
  });

  test("排序為 0～9999 整數", () => {
    expect(tradeSchema.safeParse({ ...ok, sort: -1 }).success).toBe(false);
    expect(tradeSchema.safeParse({ ...ok, sort: 10000 }).success).toBe(false);
    expect(tradeSchema.safeParse({ ...ok, sort: 1.5 }).success).toBe(false);
    expect(tradeSchema.safeParse({ ...ok, sort: 9999 }).success).toBe(true);
  });
});

describe("unitSchema", () => {
  test("名稱長度 1～10", () => {
    expect(unitSchema.safeParse({ name: "坪", sort: 0 }).success).toBe(true);
    expect(unitSchema.safeParse({ name: "", sort: 0 }).success).toBe(false);
    expect(unitSchema.safeParse({ name: "一".repeat(11), sort: 0 }).success).toBe(false);
  });
});

describe("catalogItemSchema", () => {
  const ok = {
    name: "實木地板",
    tradeId: uuid,
    unitId: null,
    spec: "",
    defaultVendorId: null,
    pricingMethod: "unit_x_qty",
    note: "",
  };

  test("合法輸入通過", () => {
    expect(catalogItemSchema.safeParse(ok).success).toBe(true);
  });

  test("pricingMethod 非法值被拒", () => {
    expect(catalogItemSchema.safeParse({ ...ok, pricingMethod: "magic" }).success).toBe(false);
  });

  test("名稱 1～100、規格 ≤500、備註 ≤1000", () => {
    expect(catalogItemSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...ok, name: "a".repeat(101) }).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...ok, spec: "a".repeat(501) }).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...ok, note: "a".repeat(1001) }).success).toBe(false);
  });

  test("tradeId 必須是 uuid 或 null", () => {
    expect(catalogItemSchema.safeParse({ ...ok, tradeId: "abc" }).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...ok, tradeId: null }).success).toBe(true);
  });
});

describe("vendorSchema", () => {
  const ok = { name: "大成水電", tradeIds: [uuid], contactName: "", phone: "", taxId: "", note: "" };

  test("統編為空或 8 位數字", () => {
    expect(vendorSchema.safeParse(ok).success).toBe(true);
    expect(vendorSchema.safeParse({ ...ok, taxId: "12345678" }).success).toBe(true);
    expect(vendorSchema.safeParse({ ...ok, taxId: "1234567" }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...ok, taxId: "123456789" }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...ok, taxId: "1234567a" }).success).toBe(false);
  });

  test("名稱 1～60、聯絡人 ≤30、電話 ≤20", () => {
    expect(vendorSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...ok, name: "a".repeat(61) }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...ok, contactName: "a".repeat(31) }).success).toBe(false);
    expect(vendorSchema.safeParse({ ...ok, phone: "1".repeat(21) }).success).toBe(false);
  });

  test("tradeIds 必須是 uuid 陣列", () => {
    expect(vendorSchema.safeParse({ ...ok, tradeIds: ["x"] }).success).toBe(false);
  });
});

describe("PRICING_METHOD_LABEL", () => {
  test("五種計價方式皆有中文標籤", () => {
    expect(PRICING_METHOD_LABEL).toEqual({
      unit_x_qty: "單價 × 數量",
      per_ping: "按坪數",
      lump_sum: "一式",
      package: "套裝方案",
      percent: "百分比加成",
    });
  });
});
