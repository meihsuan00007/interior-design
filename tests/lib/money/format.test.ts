import { describe, expect, test } from "vitest";
import { D } from "@/lib/money/decimal";
import { formatMarginRate, formatMarkup, formatTWD } from "@/lib/money/format";

describe("format", () => {
  test("formatTWD 千分位", () => {
    expect(formatTWD(D("2372051"))).toBe("2,372,051");
    expect(formatTWD(D("-750"))).toBe("-750");
    expect(formatTWD(D("0"))).toBe("0");
    expect(formatTWD(D("-1234567"))).toBe("-1,234,567");
  });
  test("formatMarkup 兩位小數，null 顯示破折號", () => {
    expect(formatMarkup(D("162000").div("120000"))).toBe("1.35");
    expect(formatMarkup(D("1.005"))).toBe("1.01");
    expect(formatMarkup(null)).toBe("—");
  });
  test("formatMarginRate 整數百分比，null 顯示破折號", () => {
    expect(formatMarginRate(D("42000").div("162000"))).toBe("26%");
    expect(formatMarginRate(D("-0.12"))).toBe("-12%");
    expect(formatMarginRate(null)).toBe("—");
  });
});
