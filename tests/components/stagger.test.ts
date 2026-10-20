import { describe, expect, test } from "vitest";
import { STAGGER_LIMIT, STAGGER_STEP, staggerDelay } from "@/components/motion/stagger";

describe("staggerDelay", () => {
  test("常數：間隔 30ms、前 20 筆", () => {
    expect(STAGGER_STEP).toBe(0.03);
    expect(STAGGER_LIMIT).toBe(20);
  });

  test("依序延遲 index × 30ms", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(0.03, 10);
    expect(staggerDelay(10)).toBeCloseTo(0.3, 10);
    expect(staggerDelay(19)).toBeCloseTo(0.57, 10);
  });

  test("第 21 筆（index 20）起不再延遲，不需動畫", () => {
    expect(staggerDelay(20)).toBeNull();
    expect(staggerDelay(500)).toBeNull();
  });

  test("不合法的 index 視為不需動畫", () => {
    expect(staggerDelay(-1)).toBeNull();
    expect(staggerDelay(Number.NaN)).toBeNull();
  });
});
