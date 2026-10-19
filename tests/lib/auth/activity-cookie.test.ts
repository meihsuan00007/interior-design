import { expect, test } from "vitest";
import { signActivity, verifyActivity } from "@/lib/auth/activity-cookie";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const now = 1_800_000_000_000;

test("簽章後可驗證並取回時間戳", async () => {
  const v = await signActivity(now - 5000, KEY);
  expect(await verifyActivity(v, now, KEY)).toBe(now - 5000);
});

test("竄改時間戳會驗證失敗", async () => {
  const v = await signActivity(now - 5000, KEY);
  const [, sig] = v.split(".");
  expect(await verifyActivity(`${now - 1000}.${sig}`, now, KEY)).toBeNull();
});

test("竄改簽章或使用不同金鑰會驗證失敗", async () => {
  const v = await signActivity(now - 5000, KEY);
  const flipped = v.slice(0, -1) + (v.endsWith("0") ? "1" : "0");
  expect(await verifyActivity(flipped, now, KEY)).toBeNull();
  expect(await verifyActivity(v, now, OTHER_KEY)).toBeNull();
});

test("未來的時間戳視為無效", async () => {
  const v = await signActivity(now + 3_600_000, KEY);
  expect(await verifyActivity(v, now, KEY)).toBeNull();
});

test("缺漏與亂碼視為無效", async () => {
  for (const g of [undefined, "", "abc", "123", "123.", "123.zz", `${now}.${"g".repeat(64)}`, "-5." + "a".repeat(64)])
    expect(await verifyActivity(g, now, KEY)).toBeNull();
});
