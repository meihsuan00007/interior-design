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
