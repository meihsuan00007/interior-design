import { expect, test } from "vitest";
import { isSessionIdle } from "@/lib/auth/idle";

const MIN = 60_000;
const now = 1_000_000_000_000;

test("閒置 119 分鐘未逾時", () => {
  expect(isSessionIdle(now - 119 * MIN, now, 120)).toBe(false);
});
test("閒置剛好 120 分鐘未逾時", () => {
  expect(isSessionIdle(now - 120 * MIN, now, 120)).toBe(false);
});
test("閒置 121 分鐘逾時", () => {
  expect(isSessionIdle(now - 121 * MIN, now, 120)).toBe(true);
});
test("尚無活動紀錄（null）不算逾時", () => {
  expect(isSessionIdle(null, now, 120)).toBe(false);
});

import { parseIdleMinutes } from "@/lib/auth/idle";

test("parseIdleMinutes：正整數、預設值與上限", () => {
  expect(parseIdleMinutes("1")).toBe(1);
  expect(parseIdleMinutes("90.9")).toBe(90);
  expect(parseIdleMinutes(undefined)).toBe(120);
  expect(parseIdleMinutes("")).toBe(120);
  expect(parseIdleMinutes("abc")).toBe(120);
  expect(parseIdleMinutes("0")).toBe(120);
  expect(parseIdleMinutes("-5")).toBe(120);
  expect(parseIdleMinutes("99999999")).toBe(7 * 24 * 60);
});
