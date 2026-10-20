import { expect, test } from "vitest";
import { isThrottled, shouldRecordAttempt, type AttemptRecord } from "@/lib/auth/login-throttle";

const now = 1_800_000_000_000;
const MIN = 60_000;
const key = { emailBidx: "e1", ipHash: "ip1" };

const fail = (ageMin: number, o: Partial<AttemptRecord> = {}): AttemptRecord => ({
  emailBidx: "e1",
  ipHash: "ipX",
  succeeded: false,
  attemptedAtMs: now - ageMin * MIN,
  ...o,
});
const many = (n: number, f: (i: number) => AttemptRecord) => Array.from({ length: n }, (_, i) => f(i));

test("同一 email 失敗 4 次未限制、5 次限制", () => {
  expect(isThrottled(many(4, () => fail(1)), key, now)).toBe(false);
  expect(isThrottled(many(5, () => fail(1)), key, now)).toBe(true);
});

test("超過 15 分鐘的失敗不計", () => {
  expect(isThrottled(many(5, () => fail(16)), key, now)).toBe(false);
  expect(isThrottled([...many(4, () => fail(1)), fail(16)], key, now)).toBe(false);
});

test("成功的嘗試不計入 email 失敗次數", () => {
  expect(isThrottled(many(5, () => fail(1, { succeeded: true })), key, now)).toBe(false);
});

test("同一 IP 19 次未限制、20 次限制（含成功與不同 email）", () => {
  const ip = (i: number) => fail(1, { emailBidx: `e${i + 10}`, ipHash: "ip1", succeeded: i % 2 === 0 });
  expect(isThrottled(many(19, ip), key, now)).toBe(false);
  expect(isThrottled(many(20, ip), key, now)).toBe(true);
});

test("IP 超過 15 分鐘的嘗試不計", () => {
  expect(isThrottled(many(20, () => fail(20, { emailBidx: "z", ipHash: "ip1" })), key, now)).toBe(false);
});

test("被節流拒絕的請求不記錄，其餘照常記錄", () => {
  expect(shouldRecordAttempt(true)).toBe(false);
  expect(shouldRecordAttempt(false)).toBe(true);
});
